import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { toCsv } from '../core/csv.js'
import { ProgressError } from '../core/errors.js'
import { formatCents } from '../core/money.js'
import {
  auditBatch,
  auditSentence,
  buildWorksheet,
  ingestDeclaration,
  type AuditResult,
  type IngestSummary,
  type ProgressBatch,
} from '../core/progress.js'
import { safeExportPath } from '../core/safe-path.js'

export interface BatchTable {
  get(key: string): ProgressBatch | undefined
  put(key: string, value: ProgressBatch): void | Promise<void>
}

export interface ToolDeps {
  /** Session-scoped batch table; the plugin creates one per apply(). */
  batches: BatchTable
  /** Local write root; the plugin uses `$DSH_HOME/dsh-progress-payment`. */
  baseDir: string
}

const text = (value: string) => [{ type: 'text' as const, text: value }]
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

const WORKSHEET_HEADER = [
  '行号',
  '清单编码',
  '名称',
  '单位',
  '合同量',
  '合同单价(元)',
  '本期完成量',
  '累计完成量',
  '本期金额(元)',
  '累计金额(元)',
  '累计比例(%)',
  '是否计入',
  '问题代码',
  '问题说明',
]

/** UTF-8 BOM so Excel on Windows opens the Chinese headers correctly. */
function worksheetCsv(batch: ProgressBatch, audit: AuditResult, toleranceBps: number): string {
  const rows = buildWorksheet(batch, audit, { price_tolerance_bps: toleranceBps }).map((row) => [
    String(row.row),
    row.item_code,
    row.item_name,
    row.unit,
    String(row.contract_qty),
    formatCents(row.contract_unit_price_cents),
    String(row.period_qty),
    String(row.cumulative_qty),
    formatCents(row.period_amount_cents),
    formatCents(row.cumulative_amount_cents),
    row.cumulative_ratio_pct.toFixed(2),
    row.counted ? '是' : '否',
    row.issue_codes.join(';'),
    row.issue_text,
  ])
  return `\uFEFF${toCsv([WORKSHEET_HEADER, ...rows])}`
}

function requireBatch(deps: ToolDeps, batchId: string | undefined): ProgressBatch {
  const batch = batchId ? deps.batches.get(batchId) : undefined
  if (!batch) throw new ProgressError('E_PROGRESS_BATCH_NOT_FOUND', `batch_id=${JSON.stringify(batchId ?? '')}`)
  return batch
}

export function createTools(deps: ToolDeps) {
  const ingest = defineTool({
    name: 'progress.ingest',
    description:
      'Import one current-period progress declaration CSV (item code, name, unit, contract qty, contract unit price, period qty, cumulative qty) and an optional contract baseline; stores the batch in session memory; no file is written.',
    parameters: {
      declaration_csv: { type: 'string', required: true },
      contract_csv: { type: 'string' },
      source_name: { type: 'string' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          batch_id: { type: 'string', required: true },
          rows: { type: 'number', required: true },
          items: { type: 'number', required: true },
          contract_items: { type: 'number', required: true },
          declaration_sha256: { type: 'string', required: true },
          contract_sha256: { type: 'string' },
        },
      },
      render: (_args, value) =>
        text(`进度款申报：${value.items} 个清单项 / ${value.rows} 行，合同基准 ${value.contract_items} 项（${value.batch_id}）`),
    },
    async execute(args) {
      const { batch, summary } = ingestDeclaration(args.declaration_csv, args.contract_csv, args.source_name ?? 'declaration.csv')
      await deps.batches.put(batch.batch_id, batch)
      return summary
    },
  })

  const audit = defineTool({
    name: 'progress.audit',
    description:
      'Audit a stored declaration: period amount in integer cents, cumulative ratio, over-contract quantity, contract/declared unit-price mismatch, cumulative-over-contract and duplicate item codes. Returns the problem list; amounts stay in integer cents. Read-only.',
    parameters: {
      batch_id: { type: 'string', required: true },
      price_tolerance_bps: { type: 'number' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          batch_id: { type: 'string', required: true },
          currency: { type: 'string', required: true },
          items: { type: 'json', required: true },
          issues: { type: 'json', required: true },
          summary: { type: 'json', required: true },
        },
      },
      render: (_args, value) => text(auditSentence(value as unknown as AuditResult)),
    },
    async execute(args) {
      const batch = requireBatch(deps, args.batch_id)
      return auditBatch(batch, { price_tolerance_bps: args.price_tolerance_bps ?? 0 })
    },
  })

  const exportCsv = defineTool({
    name: 'progress.export',
    description:
      'Run the audit again and write the review worksheet CSV (one row per declaration line, duplicate rows marked counted=no) under $DSH_HOME/dsh-progress-payment/exports; returns path, rows and sha256. Local R1 write.',
    parameters: {
      batch_id: { type: 'string', required: true },
      filename: { type: 'string' },
      price_tolerance_bps: { type: 'number' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          sha256: { type: 'string', required: true },
          rows: { type: 'number', required: true },
          bytes: { type: 'number', required: true },
          items: { type: 'number', required: true },
          issues: { type: 'number', required: true },
        },
      },
      render: (_args, value) => text(`审核底稿 ${value.rows} 行 -> ${value.path}`),
    },
    async execute(args) {
      const batch = requireBatch(deps, args.batch_id)
      const toleranceBps = args.price_tolerance_bps ?? 0
      const auditResult = auditBatch(batch, { price_tolerance_bps: toleranceBps })
      const csv = worksheetCsv(batch, auditResult, toleranceBps)
      const suffix = batch.batch_id.replace(/^pg_/, '').slice(0, 8)
      const filename = args.filename ?? `progress-audit-${suffix}.csv`
      let filePath: string
      try {
        filePath = await safeExportPath(path.join(deps.baseDir, 'exports'), filename)
      } catch (error) {
        if (error instanceof ProgressError) throw error
        throw new ProgressError('E_PROGRESS_EXPORT_FAILED', String(error))
      }
      try {
        await writeFile(filePath, csv, 'utf8')
      } catch (error) {
        throw new ProgressError('E_PROGRESS_EXPORT_FAILED', String(error))
      }
      return {
        path: filePath,
        sha256: sha256(csv),
        rows: batch.rows.length + 1,
        bytes: Buffer.byteLength(csv, 'utf8'),
        items: auditResult.summary.items,
        issues: auditResult.summary.issues,
      }
    },
  })

  return [ingest, audit, exportCsv]
}

import { createHash } from 'node:crypto'
import { cell, headerIndex, normalizeHeader, parseCsv } from './csv.js'
import { ProgressError } from './errors.js'
import {
  amountCents,
  formatCents,
  formatQty,
  parseCents,
  parseQtyMilli,
  priceToleranceCents,
  ratioPct,
} from './money.js'

/** One declaration line exactly as parsed from the CSV (row = 1-based data row). */
export interface DeclarationRow {
  row: number
  item_code: string
  item_name: string
  unit: string
  contract_qty_milli: number
  contract_unit_price_cents: number
  period_qty_milli: number
  cumulative_qty_milli: number
}

/** One contract-baseline line. Quantities and prices are authoritative for the audit. */
export interface ContractRow {
  item_code: string
  item_name: string
  unit: string
  contract_qty_milli: number
  contract_unit_price_cents: number
}

export interface ProgressBatch {
  batch_id: string
  source_name: string
  declaration_sha256: string
  contract_sha256: string | null
  rows: DeclarationRow[]
  contract: ContractRow[] | null
}

export type ProgressIssueCode =
  | 'E_PROGRESS_OVER_QTY'
  | 'E_PROGRESS_PRICE_MISMATCH'
  | 'E_PROGRESS_DUP_ITEM'
  | 'E_PROGRESS_CONTRACT_MISSING'
  | 'E_PROGRESS_CONTRACT_MISMATCH'
  | 'E_PROGRESS_QTY_INCONSISTENT'

export type ProgressIssue = {
  row: number
  item_code: string
  item_name: string
  code: ProgressIssueCode
  kind: string
  field: string
  message: string
  blocking: boolean
}

export type AuditItem = {
  row: number
  item_code: string
  item_name: string
  unit: string
  declared_contract_qty: number
  declared_contract_unit_price_cents: number
  contract_qty: number
  contract_unit_price_cents: number
  period_qty: number
  cumulative_qty: number
  period_amount_cents: number
  declared_period_amount_cents: number
  cumulative_amount_cents: number
  contract_amount_cents: number
  cumulative_ratio_pct: number
  issue_codes: ProgressIssueCode[]
}

export type AuditSummary = {
  items: number
  rows: number
  duplicate_rows: number
  contract_items: number
  period_amount_cents: number
  declared_period_amount_cents: number
  price_adjustment_cents: number
  cumulative_amount_cents: number
  contract_amount_cents: number
  cumulative_ratio_pct: number
  issues: number
  blocking_issues: number
  over_qty: number
  price_mismatch: number
  duplicate_items: number
  contract_missing: number
  contract_mismatch: number
  qty_inconsistent: number
  status: 'ok' | 'needs_review'
}

export type AuditResult = {
  batch_id: string
  currency: string
  items: AuditItem[]
  issues: ProgressIssue[]
  summary: AuditSummary
}

export type IngestSummary = {
  batch_id: string
  rows: number
  items: number
  contract_items: number
  declaration_sha256: string
  contract_sha256?: string
}

const DECLARATION_COLUMNS = {
  item_code: ['item_code', 'code', '清单编码', '项目编码'],
  item_name: ['item_name', 'name', '名称', '项目名称'],
  unit: ['unit', '单位', '计量单位'],
  contract_qty: ['contract_qty', '合同量', '合同数量'],
  contract_unit_price: ['contract_unit_price', 'contract_price', '合同单价'],
  period_qty: ['period_qty', '本期完成量', '本期工程量'],
  cumulative_qty: ['cumulative_qty', '累计完成量', '累计工程量'],
} as const

const CONTRACT_COLUMNS = {
  item_code: ['item_code', 'code', '清单编码', '项目编码'],
  contract_qty: ['contract_qty', '合同量', '合同数量'],
  contract_unit_price: ['contract_unit_price', 'contract_price', '合同单价'],
} as const

const CONTRACT_OPTIONAL_COLUMNS = {
  item_name: ['item_name', 'name', '名称', '项目名称'],
  unit: ['unit', '单位', '计量单位'],
} as const

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function readTable(text: string, label: string): { header: string[]; rows: string[][] } {
  if (typeof text !== 'string' || text.trim() === '') throw new ProgressError('E_PROGRESS_CSV_EMPTY', label)
  const parsed = parseCsv(text)
  if (parsed.length === 0) throw new ProgressError('E_PROGRESS_CSV_EMPTY', label)
  const header = parsed[0].map(normalizeHeader)
  const rows = parsed.slice(1)
  if (rows.length === 0) throw new ProgressError('E_PROGRESS_CSV_ROW', `${label} 只有表头，没有数据行`)
  return { header, rows }
}

function requireColumns(header: readonly string[], columns: Record<string, readonly string[]>, label: string): Record<string, number> {
  const index: Record<string, number> = {}
  const missing: string[] = []
  for (const [key, aliases] of Object.entries(columns)) {
    const found = headerIndex(header, aliases)
    index[key] = found
    if (found < 0) missing.push(aliases[0])
  }
  if (missing.length > 0) {
    throw new ProgressError('E_PROGRESS_CSV_ROW', `${label} 缺少列：${missing.join('、')}；表头是：${header.join('、') || '空'}`)
  }
  return index
}

function requireText(value: string, field: string, row: number): string {
  if (value === '') throw new ProgressError('E_PROGRESS_CSV_ROW', `第 ${row} 行 ${field} 为空`)
  return value
}

function requirePositiveQty(value: number, field: string, row: number): number {
  if (value <= 0) throw new ProgressError('E_PROGRESS_CSV_ROW', `第 ${row} 行 ${field} 必须大于 0`)
  return value
}

/** Parse the current-period declaration CSV. Column order is free; Chinese and English headers both work. */
export function parseDeclarationCsv(text: string): DeclarationRow[] {
  const { header, rows } = readTable(text, '申报 CSV')
  const index = requireColumns(header, DECLARATION_COLUMNS, '申报 CSV')
  return rows.map((cells, offset) => {
    const row = offset + 1
    const itemCode = requireText(cell(cells, index.item_code), '清单编码', row)
    const itemName = requireText(cell(cells, index.item_name), '名称', row)
    const unit = requireText(cell(cells, index.unit), '单位', row)
    const contractQty = requirePositiveQty(parseQtyMilli(cell(cells, index.contract_qty), '合同量', row), '合同量', row)
    const contractPrice = parseCents(cell(cells, index.contract_unit_price), '合同单价', row)
    const periodQty = parseQtyMilli(cell(cells, index.period_qty), '本期完成量', row)
    const cumulativeQty = parseQtyMilli(cell(cells, index.cumulative_qty), '累计完成量', row)
    return {
      row,
      item_code: itemCode,
      item_name: itemName,
      unit,
      contract_qty_milli: contractQty,
      contract_unit_price_cents: contractPrice,
      period_qty_milli: periodQty,
      cumulative_qty_milli: cumulativeQty,
    }
  })
}

/** Parse the contract baseline CSV: item code, contract quantity, contract unit price. */
export function parseContractCsv(text: string): ContractRow[] {
  const { header, rows } = readTable(text, '合同基准 CSV')
  const index = requireColumns(header, CONTRACT_COLUMNS, '合同基准 CSV')
  const optional = Object.fromEntries(
    Object.entries(CONTRACT_OPTIONAL_COLUMNS).map(([key, aliases]) => [key, headerIndex(header, aliases)]),
  ) as Record<string, number>
  const seen = new Set<string>()
  return rows.map((cells, offset) => {
    const row = offset + 1
    const itemCode = requireText(cell(cells, index.item_code), '清单编码', row)
    if (seen.has(itemCode)) {
      throw new ProgressError('E_PROGRESS_CSV_ROW', `合同基准第 ${row} 行清单编码 ${itemCode} 重复；合同基准必须一条清单一行`)
    }
    seen.add(itemCode)
    const contractQty = requirePositiveQty(parseQtyMilli(cell(cells, index.contract_qty), '合同量', row), '合同量', row)
    return {
      item_code: itemCode,
      item_name: cell(cells, optional.item_name ?? -1),
      unit: cell(cells, optional.unit ?? -1),
      contract_qty_milli: contractQty,
      contract_unit_price_cents: parseCents(cell(cells, index.contract_unit_price), '合同单价', row),
    }
  })
}

/** Parse and store one declaration batch. The batch id is deterministic for the same CSV pair. */
export function ingestDeclaration(declarationCsv: string, contractCsv?: string, sourceName = 'declaration.csv'): { batch: ProgressBatch; summary: IngestSummary } {
  const rows = parseDeclarationCsv(declarationCsv)
  const contract = contractCsv === undefined ? null : parseContractCsv(contractCsv)
  const declarationSha = sha256(declarationCsv)
  const contractSha = contractCsv === undefined ? null : sha256(contractCsv)
  const batchId = `pg_${sha256(`${declarationSha}\u0000${contractSha ?? ''}`).slice(0, 16)}`
  const items = new Set(rows.map((row) => row.item_code)).size
  const batch: ProgressBatch = {
    batch_id: batchId,
    source_name: sourceName,
    declaration_sha256: declarationSha,
    contract_sha256: contractSha,
    rows,
    contract,
  }
  return {
    batch,
    summary: {
      batch_id: batchId,
      rows: rows.length,
      items,
      contract_items: contract?.length ?? 0,
      declaration_sha256: declarationSha,
      contract_sha256: contractSha ?? undefined,
    },
  }
}

interface IssueDraft {
  code: ProgressIssueCode
  kind: string
  field: string
  message: string
  blocking: boolean
}

interface ResolvedRow {
  item_code: string
  item_name: string
  unit: string
  declared_contract_qty_milli: number
  declared_contract_unit_price_cents: number
  contract_qty_milli: number
  contract_unit_price_cents: number
  period_qty_milli: number
  cumulative_qty_milli: number
  period_amount_cents: number
  declared_period_amount_cents: number
  cumulative_amount_cents: number
  contract_amount_cents: number
  cumulative_ratio_pct: number
  issues: IssueDraft[]
}

const units = (milli: number): number => milli / 1000

function issueMessage(code: ProgressIssueCode, text: string, next: string): string {
  return `${text}（${code}）｜下一步：${next}`
}

function resolveRow(row: DeclarationRow, contractMap: ReadonlyMap<string, ContractRow> | null, toleranceBps: number): ResolvedRow {
  const drafts: IssueDraft[] = []
  let contractQty = row.contract_qty_milli
  let contractPrice = row.contract_unit_price_cents
  const baseline = contractMap?.get(row.item_code)
  if (contractMap) {
    if (!baseline) {
      drafts.push({
        code: 'E_PROGRESS_CONTRACT_MISSING',
        kind: 'contract_missing',
        field: 'item_code',
        message: issueMessage(
          'E_PROGRESS_CONTRACT_MISSING',
          `清单编码 ${row.item_code} 不在合同基准里`,
          '先补合同基准；补不了就单独确认这条清单的合同量和单价，不要直接计入本期',
        ),
        blocking: true,
      })
    } else {
      contractQty = baseline.contract_qty_milli
      contractPrice = baseline.contract_unit_price_cents
      if (row.contract_qty_milli !== baseline.contract_qty_milli) {
        drafts.push({
          code: 'E_PROGRESS_CONTRACT_MISMATCH',
          kind: 'contract_qty_mismatch',
          field: 'contract_qty',
          message: issueMessage(
            'E_PROGRESS_CONTRACT_MISMATCH',
            `申报合同量 ${formatQty(row.contract_qty_milli)} 与合同基准 ${formatQty(baseline.contract_qty_milli)} 不符`,
            '以合同基准为准改正申报；确需调整先办合同变更',
          ),
          blocking: true,
        })
      }
      const tolerance = priceToleranceCents(baseline.contract_unit_price_cents, toleranceBps)
      if (Math.abs(row.contract_unit_price_cents - baseline.contract_unit_price_cents) > tolerance) {
        drafts.push({
          code: 'E_PROGRESS_PRICE_MISMATCH',
          kind: 'price_mismatch',
          field: 'contract_unit_price',
          message: issueMessage(
            'E_PROGRESS_PRICE_MISMATCH',
            `申报合同单价 ${formatCents(row.contract_unit_price_cents)} 与合同基准 ${formatCents(baseline.contract_unit_price_cents)} 不符`,
            `本期金额按合同单价 ${formatCents(baseline.contract_unit_price_cents)} 重算，并要求申报方改正`,
          ),
          blocking: true,
        })
      }
    }
  }
  if (row.cumulative_qty_milli < row.period_qty_milli) {
    drafts.push({
      code: 'E_PROGRESS_QTY_INCONSISTENT',
      kind: 'cumulative_below_period',
      field: 'cumulative_qty',
      message: issueMessage(
        'E_PROGRESS_QTY_INCONSISTENT',
        `累计完成量 ${formatQty(row.cumulative_qty_milli)} 小于本期完成量 ${formatQty(row.period_qty_milli)}`,
        '核对上期累计数；累计完成量应当大于或等于本期完成量',
      ),
      blocking: true,
    })
  }
  if (row.period_qty_milli > contractQty) {
    drafts.push({
      code: 'E_PROGRESS_OVER_QTY',
      kind: 'period_over_contract',
      field: 'period_qty',
      message: issueMessage(
        'E_PROGRESS_OVER_QTY',
        `本期完成量 ${formatQty(row.period_qty_milli)} 超过合同量 ${formatQty(contractQty)}`,
        '核对合同量和变更签证；超过合同量的部分不得计入本期',
      ),
      blocking: true,
    })
  }
  if (row.cumulative_qty_milli > contractQty) {
    drafts.push({
      code: 'E_PROGRESS_OVER_QTY',
      kind: 'cumulative_over_contract',
      field: 'cumulative_qty',
      message: issueMessage(
        'E_PROGRESS_OVER_QTY',
        `累计完成量 ${formatQty(row.cumulative_qty_milli)} 超过合同量 ${formatQty(contractQty)}`,
        '核对合同量和变更签证；超量部分走变更或结算，不在本期支付',
      ),
      blocking: true,
    })
  }

  const periodAmount = amountCents(row.period_qty_milli, contractPrice)
  const cumulativeAmount = amountCents(row.cumulative_qty_milli, contractPrice)
  const contractAmount = amountCents(contractQty, contractPrice)
  return {
    item_code: row.item_code,
    item_name: row.item_name,
    unit: row.unit,
    declared_contract_qty_milli: row.contract_qty_milli,
    declared_contract_unit_price_cents: row.contract_unit_price_cents,
    contract_qty_milli: contractQty,
    contract_unit_price_cents: contractPrice,
    period_qty_milli: row.period_qty_milli,
    cumulative_qty_milli: row.cumulative_qty_milli,
    period_amount_cents: periodAmount,
    declared_period_amount_cents: amountCents(row.period_qty_milli, row.contract_unit_price_cents),
    cumulative_amount_cents: cumulativeAmount,
    contract_amount_cents: contractAmount,
    cumulative_ratio_pct: ratioPct(cumulativeAmount, contractAmount),
    issues: drafts,
  }
}

/** Audit one stored batch: amounts in integer cents, cumulative ratio, over-quantity, price and duplicate checks. */
export function auditBatch(batch: ProgressBatch, options: { price_tolerance_bps?: number } = {}): AuditResult {
  const toleranceBps = options.price_tolerance_bps ?? 0
  if (!Number.isFinite(toleranceBps) || toleranceBps < 0) {
    throw new ProgressError('E_PROGRESS_OPTION_INVALID', `price_tolerance_bps=${toleranceBps}`)
  }
  const contractMap = batch.contract ? new Map(batch.contract.map((row) => [row.item_code, row])) : null

  const firstRows = new Map<string, DeclarationRow>()
  const counts = new Map<string, DeclarationRow[]>()
  for (const row of batch.rows) {
    if (!firstRows.has(row.item_code)) firstRows.set(row.item_code, row)
    const bucket = counts.get(row.item_code) ?? []
    bucket.push(row)
    counts.set(row.item_code, bucket)
  }

  const items: AuditItem[] = []
  const issues: ProgressIssue[] = []
  for (const row of firstRows.values()) {
    const resolved = resolveRow(row, contractMap, toleranceBps)
    for (const draft of resolved.issues) {
      issues.push({
        row: row.row,
        item_code: resolved.item_code,
        item_name: resolved.item_name,
        code: draft.code,
        kind: draft.kind,
        field: draft.field,
        message: draft.message,
        blocking: draft.blocking,
      })
    }
    items.push({
      row: row.row,
      item_code: resolved.item_code,
      item_name: resolved.item_name,
      unit: resolved.unit,
      declared_contract_qty: units(resolved.declared_contract_qty_milli),
      declared_contract_unit_price_cents: resolved.declared_contract_unit_price_cents,
      contract_qty: units(resolved.contract_qty_milli),
      contract_unit_price_cents: resolved.contract_unit_price_cents,
      period_qty: units(resolved.period_qty_milli),
      cumulative_qty: units(resolved.cumulative_qty_milli),
      period_amount_cents: resolved.period_amount_cents,
      declared_period_amount_cents: resolved.declared_period_amount_cents,
      cumulative_amount_cents: resolved.cumulative_amount_cents,
      contract_amount_cents: resolved.contract_amount_cents,
      cumulative_ratio_pct: resolved.cumulative_ratio_pct,
      issue_codes: resolved.issues.map((draft) => draft.code),
    })
  }

  let duplicateRows = 0
  for (const [code, rows] of counts) {
    if (rows.length < 2) continue
    duplicateRows += rows.length - 1
    const message = issueMessage(
      'E_PROGRESS_DUP_ITEM',
      `清单编码 ${code} 在本期申报里出现 ${rows.length} 次（行 ${rows.map((row) => row.row).join('、')}）`,
      '确认哪一行是本期应报的；重复行不计入本期金额',
    )
    issues.push({
      row: rows[1].row,
      item_code: code,
      item_name: rows[1].item_name,
      code: 'E_PROGRESS_DUP_ITEM',
      kind: 'duplicate_item',
      field: 'item_code',
      message,
      blocking: true,
    })
  }

  issues.sort((left, right) => left.row - right.row || left.code.localeCompare(right.code) || left.kind.localeCompare(right.kind))
  for (const item of items) item.issue_codes = [...new Set(item.issue_codes)].sort()

  const periodAmount = items.reduce((total, item) => total + item.period_amount_cents, 0)
  const declaredPeriodAmount = items.reduce((total, item) => total + item.declared_period_amount_cents, 0)
  const cumulativeAmount = items.reduce((total, item) => total + item.cumulative_amount_cents, 0)
  const contractAmount = items.reduce((total, item) => total + item.contract_amount_cents, 0)
  const countCode = (code: ProgressIssueCode): number => issues.filter((issue) => issue.code === code).length

  return {
    batch_id: batch.batch_id,
    currency: 'CNY',
    items,
    issues,
    summary: {
      items: items.length,
      rows: batch.rows.length,
      duplicate_rows: duplicateRows,
      contract_items: batch.contract?.length ?? 0,
      period_amount_cents: periodAmount,
      declared_period_amount_cents: declaredPeriodAmount,
      price_adjustment_cents: periodAmount - declaredPeriodAmount,
      cumulative_amount_cents: cumulativeAmount,
      contract_amount_cents: contractAmount,
      cumulative_ratio_pct: ratioPct(cumulativeAmount, contractAmount),
      issues: issues.length,
      blocking_issues: issues.filter((issue) => issue.blocking).length,
      over_qty: countCode('E_PROGRESS_OVER_QTY'),
      price_mismatch: countCode('E_PROGRESS_PRICE_MISMATCH'),
      duplicate_items: countCode('E_PROGRESS_DUP_ITEM'),
      contract_missing: countCode('E_PROGRESS_CONTRACT_MISSING'),
      contract_mismatch: countCode('E_PROGRESS_CONTRACT_MISMATCH'),
      qty_inconsistent: countCode('E_PROGRESS_QTY_INCONSISTENT'),
      status: issues.length === 0 ? 'ok' : 'needs_review',
    },
  }
}

export interface WorksheetRow {
  row: number
  item_code: string
  item_name: string
  unit: string
  contract_qty: number
  contract_unit_price_cents: number
  period_qty: number
  cumulative_qty: number
  period_amount_cents: number
  cumulative_amount_cents: number
  cumulative_ratio_pct: number
  counted: boolean
  issue_codes: ProgressIssueCode[]
  issue_text: string
}

/** Build one worksheet row per declaration line; repeated item codes are marked counted=false. */
export function buildWorksheet(batch: ProgressBatch, audit: AuditResult, options: { price_tolerance_bps?: number } = {}): WorksheetRow[] {
  const contractMap = batch.contract ? new Map(batch.contract.map((row) => [row.item_code, row])) : null
  const seen = new Set<string>()
  const toleranceBps = options.price_tolerance_bps ?? 0
  return batch.rows.map((row) => {
    const duplicate = seen.has(row.item_code)
    seen.add(row.item_code)
    const resolved = resolveRow(row, contractMap, toleranceBps)
    const codes = resolved.issues.map((draft) => draft.code)
    if (duplicate) codes.push('E_PROGRESS_DUP_ITEM')
    const uniqueCodes = [...new Set(codes)].sort()
    const messages = resolved.issues.map((draft) => draft.message)
    if (duplicate) {
      messages.push(
        issueMessage('E_PROGRESS_DUP_ITEM', `清单编码 ${row.item_code} 在本期申报里重复出现`, '确认哪一行是本期应报的；重复行不计入本期金额'),
      )
    }
    return {
      row: row.row,
      item_code: row.item_code,
      item_name: row.item_name,
      unit: row.unit,
      contract_qty: units(resolved.contract_qty_milli),
      contract_unit_price_cents: resolved.contract_unit_price_cents,
      period_qty: units(resolved.period_qty_milli),
      cumulative_qty: units(resolved.cumulative_qty_milli),
      period_amount_cents: resolved.period_amount_cents,
      cumulative_amount_cents: resolved.cumulative_amount_cents,
      cumulative_ratio_pct: resolved.cumulative_ratio_pct,
      counted: !duplicate,
      issue_codes: uniqueCodes,
      issue_text: messages.join('；'),
    }
  })
}

/** Human sentence for one audit result; used by tool renderers and the quickstart. */
export function auditSentence(audit: AuditResult): string {
  const { summary } = audit
  return `进度款审核：${summary.items} 个清单项，本期 ${formatCents(summary.period_amount_cents)} CNY，累计 ${formatCents(summary.cumulative_amount_cents)} CNY（${summary.cumulative_ratio_pct}%），${summary.issues} 个问题`
}

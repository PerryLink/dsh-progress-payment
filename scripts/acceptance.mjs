#!/usr/bin/env node
/**
 * Acceptance checks over the synthetic quickstart fixture. Writes ACCEPTANCE.csv
 * and evidence/<run_id>/result.json. No network, no customer data.
 *
 *   node scripts/acceptance.mjs
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDeclarationCsv } from '../lib/core/progress.js'
import { createTools } from '../lib/plugin/tools.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const errors = []

class MemoryTable {
  constructor() {
    this.map = new Map()
  }
  get(key) {
    return this.map.get(key)
  }
  put(key, value) {
    this.map.set(key, value)
  }
}

async function errorCode(promise) {
  try {
    await promise
    return 'NO_ERROR'
  } catch (error) {
    return error?.code ?? error?.name ?? 'UNKNOWN'
  }
}

async function main() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-progress-payment-acceptance-'))
  try {
    const tools = Object.fromEntries(createTools({ batches: new MemoryTable(), baseDir: tempDir }).map((tool) => [tool.name, tool]))
    const exec = { callId: 'acceptance' }
    const declarationCsv = readFileSync(path.join(root, 'samples', 'quickstart', 'input', 'declaration-2026-10.csv'), 'utf8')
    const contractCsv = readFileSync(path.join(root, 'samples', 'quickstart', 'input', 'contract-baseline.csv'), 'utf8')

    const ingested = await tools['progress.ingest'].execute(
      { declaration_csv: declarationCsv, contract_csv: contractCsv, source_name: 'declaration-2026-10.csv' },
      exec,
    )
    const audit = await tools['progress.audit'].execute({ batch_id: ingested.batch_id }, exec)
    const exported = await tools['progress.export'].execute(
      { batch_id: ingested.batch_id, filename: 'progress-audit-2026-10.csv' },
      exec,
    )
    const csvText = readFileSync(exported.path, 'utf8')
    const shuffled = parseDeclarationCsv(
      'item_code,period_qty,cumulative_qty,contract_unit_price,contract_qty,name,unit\nA-1,20,60,500.00,100,混凝土,m3\n',
    )
    const missingColumn = await errorCode(
      tools['progress.ingest'].execute({ declaration_csv: '清单编码,名称,单位,合同量,合同单价,本期完成量\nA-1,混凝土,m3,100,500.00,20\n' }, exec),
    )
    const unknownBatch = await errorCode(tools['progress.audit'].execute({ batch_id: 'pg_missing' }, exec))
    const traversal = await errorCode(
      tools['progress.export'].execute({ batch_id: ingested.batch_id, filename: '../evil.csv' }, exec),
    )
    const badTolerance = await errorCode(
      tools['progress.audit'].execute({ batch_id: ingested.batch_id, price_tolerance_bps: -1 }, exec),
    )

    // ACCEPTANCE.csv uses a simple comma-split schema: keep every field free of commas.
    const metrics = [
      {
        req_id: 'PG-A01',
        metric: 'ingest rows/items',
        threshold: '7 rows 6 items 6 contract',
        actual: `${ingested.rows} rows ${ingested.items} items ${ingested.contract_items} contract`,
        pass: ingested.rows === 7 && ingested.items === 6 && ingested.contract_items === 6,
      },
      {
        req_id: 'PG-A02',
        metric: 'period amount cents',
        threshold: '5076360',
        actual: String(audit.summary.period_amount_cents),
        pass: audit.summary.period_amount_cents === 5076360,
      },
      {
        req_id: 'PG-A03',
        metric: 'cumulative ratio',
        threshold: '84.62',
        actual: String(audit.summary.cumulative_ratio_pct),
        pass: audit.summary.cumulative_ratio_pct === 84.62,
      },
      {
        req_id: 'PG-A04',
        metric: 'cumulative amount cents',
        threshold: '61414500',
        actual: String(audit.summary.cumulative_amount_cents),
        pass: audit.summary.cumulative_amount_cents === 61414500,
      },
      {
        req_id: 'PG-A05',
        metric: 'over quantity issue',
        threshold: 'E_PROGRESS_OVER_QTY x1',
        actual: `over_qty=${audit.summary.over_qty}`,
        pass: audit.summary.over_qty === 1 && audit.issues.some((issue) => issue.code === 'E_PROGRESS_OVER_QTY'),
      },
      {
        req_id: 'PG-A06',
        metric: 'price mismatch issue',
        threshold: 'E_PROGRESS_PRICE_MISMATCH x1',
        actual: `price_mismatch=${audit.summary.price_mismatch}`,
        pass: audit.summary.price_mismatch === 1 && audit.issues.some((issue) => issue.code === 'E_PROGRESS_PRICE_MISMATCH'),
      },
      {
        req_id: 'PG-A07',
        metric: 'duplicate item issue',
        threshold: 'E_PROGRESS_DUP_ITEM x1',
        actual: `duplicate_items=${audit.summary.duplicate_items}`,
        pass: audit.summary.duplicate_items === 1 && audit.summary.duplicate_rows === 1,
      },
      {
        req_id: 'PG-A08',
        metric: 'export sha256/rows',
        threshold: 'sha equals file rows=8',
        actual: `${exported.rows} rows ${exported.bytes} bytes`,
        pass:
          exported.rows === 8 &&
          exported.sha256 === sha256(csvText) &&
          exported.bytes === Buffer.byteLength(csvText, 'utf8') &&
          exported.items === 6 &&
          exported.issues === 3,
      },
      {
        req_id: 'PG-A09',
        metric: 'export path safety',
        threshold: 'traversal rejected',
        actual: traversal,
        pass: traversal === 'E_PROGRESS_PATH_INVALID',
      },
      {
        req_id: 'PG-A10',
        metric: 'missing column error',
        threshold: 'E_PROGRESS_CSV_ROW',
        actual: missingColumn,
        pass: missingColumn === 'E_PROGRESS_CSV_ROW',
      },
      {
        req_id: 'PG-A11',
        metric: 'unknown batch error',
        threshold: 'E_PROGRESS_BATCH_NOT_FOUND',
        actual: unknownBatch,
        pass: unknownBatch === 'E_PROGRESS_BATCH_NOT_FOUND',
      },
      {
        req_id: 'PG-A12',
        metric: 'BOM + duplicate row',
        threshold: 'BOM yes counted=no',
        actual: `bom=${csvText.charCodeAt(0) === 0xfeff ? 'yes' : 'no'} counted_no=${/,否,E_PROGRESS_DUP_ITEM,/.test(csvText) ? 'yes' : 'missing'}`,
        pass: csvText.charCodeAt(0) === 0xfeff && /,否,E_PROGRESS_DUP_ITEM,/.test(csvText),
      },
      {
        req_id: 'PG-A13',
        metric: 'English/reordered headers',
        threshold: '1 row',
        actual: `${shuffled.length} row ${shuffled[0]?.period_qty_milli ?? 0} milli`,
        pass: shuffled.length === 1 && shuffled[0].item_code === 'A-1' && shuffled[0].period_qty_milli === 20000,
      },
      {
        req_id: 'PG-A14',
        metric: 'invalid tolerance error',
        threshold: 'E_PROGRESS_OPTION_INVALID',
        actual: badTolerance,
        pass: badTolerance === 'E_PROGRESS_OPTION_INVALID',
      },
    ]

    let quickstartPass = true
    try {
      execFileSync(process.execPath, ['samples/quickstart/run.mjs', '--check'], { cwd: root, stdio: 'ignore' })
    } catch {
      quickstartPass = false
    }
    const quickstartHash = sha256(readFileSync(path.join(root, 'samples', 'quickstart', 'expected', 'result.json')))
    const quickstart = { req_id: 'PS1-QS01', metric: 'quickstart golden', threshold: '1/1', actual: quickstartPass ? '1' : '0', pass: quickstartPass, evidence_sha256: quickstartHash }

    const failures = metrics.filter((item) => !item.pass)
    for (const failure of failures) errors.push(`${failure.req_id} ${failure.metric}: ${failure.actual}`)
    if (!quickstartPass) errors.push('PS1-QS01 quickstart golden failed')

    const runId = `progress-payment-${Date.now()}`
    const evidence = {
      run_id: runId,
      scope: 'PROGRESS-PAYMENT-S1',
      status: failures.length === 0 && quickstartPass ? 'pass' : 'fail',
      counted: false,
      note: 'synthetic declaration + contract baseline only; no customer data, no network',
      metrics,
      pass: failures.length === 0 && quickstartPass,
    }
    const evidenceDir = path.join(root, 'evidence', runId)
    mkdirSync(evidenceDir, { recursive: true })
    const evidenceJson = `${JSON.stringify(evidence, null, 2)}\n`
    writeFileSync(path.join(evidenceDir, 'result.json'), evidenceJson)
    const evidenceHash = sha256(evidenceJson)

    const rows = [
      ...metrics.map((item) => `${item.req_id},${item.metric},${item.threshold},${item.actual},scripts/acceptance.mjs,${evidenceHash},${item.pass},public/synthetic,false`),
      `${quickstart.req_id},${quickstart.metric},${quickstart.threshold},${quickstart.actual},samples/quickstart/run.mjs,${quickstart.evidence_sha256},${quickstart.pass},synthetic/quickstart,true`,
    ]
    writeFileSync(
      path.join(root, 'ACCEPTANCE.csv'),
      `req_id,metric,threshold,actual,script,evidence_sha256,pass,source,counted\n${rows.join('\n')}\n`,
    )

    if (errors.length > 0) {
      for (const error of errors) console.error(`acceptance: ${error}`)
      process.exit(1)
    }
    console.log(`acceptance ok: ${metrics.length + 1} checks`)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

await main()

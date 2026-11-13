#!/usr/bin/env node
/**
 * dsh-progress-payment quickstart — audits the bundled synthetic declaration
 * against the bundled contract baseline and exports the review worksheet.
 *
 *   node samples/quickstart/run.mjs            # human-readable summary
 *   node samples/quickstart/run.mjs --json     # the golden result on stdout
 *   node samples/quickstart/run.mjs --check    # recompute and diff against the golden file
 *
 * The golden file `expected/result.json` is the stdout of `--json`; it is a real
 * run over the committed CSVs, not hand-written output. No network, no model,
 * no customer data: every code and amount is synthetic.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTools } from '../../lib/plugin/tools.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const DECLARATION = 'samples/quickstart/input/declaration-2026-10.csv'
const CONTRACT = 'samples/quickstart/input/contract-baseline.csv'
const expectedPath = path.join(here, 'expected', 'result.json')
const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--json') ? 'json' : 'summary'
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

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

async function run() {
  const declarationText = await readFile(path.join(root, DECLARATION), 'utf8')
  const contractText = await readFile(path.join(root, CONTRACT), 'utf8')
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dsh-progress-payment-quickstart-'))
  const realTemp = await realpath(tempDir)
  try {
    const tools = Object.fromEntries(createTools({ batches: new MemoryTable(), baseDir: tempDir }).map((tool) => [tool.name, tool]))
    const exec = { callId: 'quickstart', agent: { id: 'quickstart' } }

    const ingest = await tools['progress_ingest'].execute(
      { declaration_csv: declarationText, contract_csv: contractText, source_name: 'declaration-2026-10.csv' },
      exec,
    )
    const audit = await tools['progress_audit'].execute({ batch_id: ingest.batch_id }, exec)
    const exported = await tools['progress_export'].execute(
      { batch_id: ingest.batch_id, filename: 'progress-audit-2026-10.csv' },
      exec,
    )
    const csvText = await readFile(exported.path, 'utf8')

    return {
      _note:
        'Real tool output. The export path is normalised to exports/<file>.csv (the run directory is a temp dir); everything else is verbatim. Amounts are integer cents.',
      sample: {
        declaration: { path: DECLARATION, bytes: Buffer.byteLength(declarationText), sha256: sha256(declarationText) },
        contract: { path: CONTRACT, bytes: Buffer.byteLength(contractText), sha256: sha256(contractText) },
      },
      ingest,
      audit,
      export: {
        path: `exports/${path.basename(exported.path)}`,
        sha256: exported.sha256,
        rows: exported.rows,
        bytes: exported.bytes,
        items: exported.items,
        issues: exported.issues,
      },
      worksheet: {
        bom: csvText.charCodeAt(0) === 0xfeff,
        text: csvText.replace(/^\uFEFF/, ''),
      },
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

function printSummary(result) {
  const { audit, export: exported, worksheet } = result
  const summary = audit.summary
  console.log('dsh-progress-payment quickstart - synthetic progress declaration (not customer data)')
  console.log(`declaration: ${result.sample.declaration.path} (${summary.rows} rows / ${summary.items} items)`)
  console.log(`contract baseline: ${summary.contract_items} items; batch ${audit.batch_id}`)
  console.log(`period amount: ${(summary.period_amount_cents / 100).toFixed(2)} CNY (declared ${(summary.declared_period_amount_cents / 100).toFixed(2)})`)
  console.log(`cumulative: ${(summary.cumulative_amount_cents / 100).toFixed(2)} CNY / contract ${(summary.contract_amount_cents / 100).toFixed(2)} = ${summary.cumulative_ratio_pct}%`)
  console.log(`issues: ${summary.issues} (over qty ${summary.over_qty}, price mismatch ${summary.price_mismatch}, duplicate ${summary.duplicate_items})`)
  for (const issue of audit.issues) console.log(`  row ${issue.row} ${issue.item_code} ${issue.code} ${issue.message.split('（')[0]}`)
  console.log(`worksheet: ${exported.path} ${exported.rows} rows, ${exported.bytes} bytes, sha256 ${exported.sha256.slice(0, 12)}...`)
  console.log(`worksheet columns: ${worksheet.text.split('\n')[0]}`)
}

const result = await run()

if (mode === 'json') {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else if (mode === 'check') {
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
  assert.deepEqual(result, expected)
  printSummary(result)
  console.log('golden samples/quickstart/expected/result.json matches')
  console.log('quickstart ok')
} else {
  printSummary(result)
  console.log('run with --check to compare against expected/result.json')
}

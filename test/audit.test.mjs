import test from 'node:test'
import assert from 'node:assert/strict'
import { auditBatch, buildWorksheet, ingestDeclaration, parseDeclarationCsv } from '../lib/core/progress.js'
import {
  CLEAN_CONTRACT,
  CLEAN_DECLARATION,
  SAMPLE_CONTRACT,
  SAMPLE_DECLARATION,
  contract,
  declaration,
} from './helpers/fixtures.mjs'

function batchOf(declarationCsv, contractCsv) {
  return ingestDeclaration(declarationCsv, contractCsv).batch
}

function ingestError(declarationCsv, contractCsv) {
  try {
    ingestDeclaration(declarationCsv, contractCsv)
    return null
  } catch (error) {
    return error
  }
}

test('sample declaration: 7 rows / 6 items, 3 blocking issues and exact integer-cent totals', () => {
  const audit = auditBatch(batchOf(SAMPLE_DECLARATION, SAMPLE_CONTRACT))
  assert.equal(audit.batch_id.startsWith('pg_'), true)
  assert.equal(audit.currency, 'CNY')
  assert.deepEqual(
    {
      items: audit.summary.items,
      rows: audit.summary.rows,
      duplicate_rows: audit.summary.duplicate_rows,
      contract_items: audit.summary.contract_items,
      period_amount_cents: audit.summary.period_amount_cents,
      declared_period_amount_cents: audit.summary.declared_period_amount_cents,
      price_adjustment_cents: audit.summary.price_adjustment_cents,
      cumulative_amount_cents: audit.summary.cumulative_amount_cents,
      contract_amount_cents: audit.summary.contract_amount_cents,
      cumulative_ratio_pct: audit.summary.cumulative_ratio_pct,
      issues: audit.summary.issues,
      over_qty: audit.summary.over_qty,
      price_mismatch: audit.summary.price_mismatch,
      duplicate_items: audit.summary.duplicate_items,
      status: audit.summary.status,
    },
    {
      items: 6,
      rows: 7,
      duplicate_rows: 1,
      contract_items: 6,
      period_amount_cents: 5076360,
      declared_period_amount_cents: 5162760,
      price_adjustment_cents: -86400,
      cumulative_amount_cents: 61414500,
      contract_amount_cents: 72575000,
      cumulative_ratio_pct: 84.62,
      issues: 3,
      over_qty: 1,
      price_mismatch: 1,
      duplicate_items: 1,
      status: 'needs_review',
    },
  )
  assert.deepEqual(audit.issues.map((issue) => issue.code), [
    'E_PROGRESS_OVER_QTY',
    'E_PROGRESS_PRICE_MISMATCH',
    'E_PROGRESS_DUP_ITEM',
  ])
})

test('over-quantity flags both period-over and cumulative-over contract', () => {
  const audit = auditBatch(batchOf(declaration(['B-1,混凝土,m3,100,500.00,120,130']), contract(['B-1,100,500.00'])))
  assert.equal(audit.summary.over_qty, 2)
  assert.deepEqual(
    audit.issues.map((issue) => issue.kind).sort(),
    ['cumulative_over_contract', 'period_over_contract'],
  )
  assert.equal(audit.summary.status, 'needs_review')
})

test('price mismatch is exact by default and can be relaxed with basis points', () => {
  const declarationCsv = declaration(['A-1,基础模板,m2,1800,65.00,86.4,1720'])
  const contractCsv = contract(['A-1,1800,55.00'])
  const exact = auditBatch(batchOf(declarationCsv, contractCsv))
  assert.equal(exact.summary.price_mismatch, 1)
  assert.equal(exact.items[0].contract_unit_price_cents, 5500)
  assert.equal(exact.items[0].period_amount_cents, 475200)
  assert.equal(exact.items[0].declared_period_amount_cents, 561600)

  const relaxed = auditBatch(batchOf(declarationCsv, contractCsv), { price_tolerance_bps: 2000 })
  assert.equal(relaxed.summary.price_mismatch, 0)
  assert.equal(relaxed.summary.status, 'ok')
  assert.equal(relaxed.items[0].period_amount_cents, 475200)
})

test('duplicate item codes produce one issue and are not double-counted', () => {
  const audit = auditBatch(batchOf(SAMPLE_DECLARATION, SAMPLE_CONTRACT))
  const duplicate = audit.issues.find((issue) => issue.code === 'E_PROGRESS_DUP_ITEM')
  assert.ok(duplicate)
  assert.equal(duplicate.row, 7)
  assert.match(duplicate.message, /出现 2 次/)
  assert.equal(audit.items.length, 6)
  assert.equal(audit.summary.period_amount_cents, 5076360)
  assert.deepEqual(audit.items.find((item) => item.item_code === '010101003').issue_codes, [])
})

test('an item missing from the contract baseline is flagged and falls back to declared values', () => {
  const audit = auditBatch(batchOf(declaration(['Z-9,新增项目,m3,10,100.00,5,5']), contract(['A-1,100,500.00'])))
  assert.equal(audit.summary.contract_missing, 1)
  assert.equal(audit.items[0].contract_qty, 10)
  assert.equal(audit.items[0].period_amount_cents, 50000)
  assert.equal(audit.summary.status, 'needs_review')
})

test('a declared contract quantity that differs from the baseline is flagged', () => {
  const audit = auditBatch(batchOf(declaration(['A-1,混凝土,m3,120,500.00,20,90']), contract(['A-1,100,500.00'])))
  assert.equal(audit.summary.contract_mismatch, 1)
  assert.equal(audit.items[0].contract_qty, 100)
  assert.equal(audit.items[0].declared_contract_qty, 120)
  assert.equal(audit.summary.over_qty, 0)
  assert.equal(audit.issues[0].message.includes('申报合同量 120 与合同基准 100 不符'), true)
})

test('cumulative below the period quantity is flagged as inconsistent', () => {
  const audit = auditBatch(batchOf(declaration(['A-1,混凝土,m3,100,500.00,20,10']), contract(['A-1,100,500.00'])))
  assert.equal(audit.summary.qty_inconsistent, 1)
  assert.equal(audit.issues[0].code, 'E_PROGRESS_QTY_INCONSISTENT')
})

test('a clean declaration returns status ok with zero issues', () => {
  const audit = auditBatch(batchOf(CLEAN_DECLARATION, CLEAN_CONTRACT))
  assert.equal(audit.summary.status, 'ok')
  assert.equal(audit.summary.issues, 0)
  assert.equal(audit.summary.period_amount_cents, 2000000)
  assert.equal(audit.summary.cumulative_amount_cents, 6000000)
  assert.equal(audit.summary.contract_amount_cents, 10000000)
  assert.equal(audit.summary.cumulative_ratio_pct, 60)
  assert.deepEqual(audit.items.map((item) => item.issue_codes), [[], []])
})

test('without a contract baseline the declared contract values are used and no baseline issues are raised', () => {
  const audit = auditBatch(batchOf(CLEAN_DECLARATION))
  assert.equal(audit.summary.contract_items, 0)
  assert.equal(audit.summary.contract_missing, 0)
  assert.equal(audit.summary.status, 'ok')
  assert.equal(audit.summary.period_amount_cents, 2000000)
})

test('a missing required CSV column is E_PROGRESS_CSV_ROW', () => {
  const error = ingestError('清单编码,名称,单位,合同量,合同单价,本期完成量\nA-1,混凝土,m3,100,500.00,20\n', CLEAN_CONTRACT)
  assert.equal(error?.code, 'E_PROGRESS_CSV_ROW')
  assert.match(error.message, /缺少列/)
  assert.match(error.message, /累计完成量|cumulative_qty/)
})

test('a duplicate item code inside the contract baseline is E_PROGRESS_CSV_ROW', () => {
  const error = ingestError(CLEAN_DECLARATION, contract(['A-1,100,500.00', 'A-1,100,500.00']))
  assert.equal(error?.code, 'E_PROGRESS_CSV_ROW')
  assert.match(error.message, /重复/)
})

test('English and reordered headers parse to the same values', () => {
  const csv = 'item_code,period_qty,cumulative_qty,contract_unit_price,contract_qty,name,unit\nA-1,20,60,500.00,100,混凝土,m3\n'
  const [row] = parseDeclarationCsv(csv)
  assert.deepEqual(
    {
      item_code: row.item_code,
      item_name: row.item_name,
      unit: row.unit,
      contract_qty_milli: row.contract_qty_milli,
      contract_unit_price_cents: row.contract_unit_price_cents,
      period_qty_milli: row.period_qty_milli,
      cumulative_qty_milli: row.cumulative_qty_milli,
    },
    {
      item_code: 'A-1',
      item_name: '混凝土',
      unit: 'm3',
      contract_qty_milli: 100000,
      contract_unit_price_cents: 50000,
      period_qty_milli: 20000,
      cumulative_qty_milli: 60000,
    },
  )
})

test('an invalid price tolerance is E_PROGRESS_OPTION_INVALID', () => {
  const batch = batchOf(CLEAN_DECLARATION, CLEAN_CONTRACT)
  assert.throws(() => auditBatch(batch, { price_tolerance_bps: -1 }), { code: 'E_PROGRESS_OPTION_INVALID' })
  assert.throws(() => auditBatch(batch, { price_tolerance_bps: Number.NaN }), { code: 'E_PROGRESS_OPTION_INVALID' })
})

test('the worksheet keeps every declaration line and marks repeats counted=false', () => {
  const batch = batchOf(SAMPLE_DECLARATION, SAMPLE_CONTRACT)
  const audit = auditBatch(batch)
  const rows = buildWorksheet(batch, audit)
  assert.equal(rows.length, 7)
  assert.equal(rows.filter((row) => row.counted).length, 6)
  assert.equal(rows[6].counted, false)
  assert.deepEqual(rows[6].issue_codes, ['E_PROGRESS_DUP_ITEM'])
  assert.equal(rows[3].counted, true)
  assert.deepEqual(rows[3].issue_codes, ['E_PROGRESS_OVER_QTY'])
  assert.equal(rows[0].period_amount_cents, 105000)
})

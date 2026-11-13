import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import * as plugin from '../lib/plugin/index.js'
import {
  SAMPLE_CONTRACT,
  SAMPLE_DECLARATION,
  makeTempDir,
  makeTools,
  rejectsWithCode,
} from './helpers/fixtures.mjs'

test('createTools exposes the three progress_* tools with unique names', async (t) => {
  const dir = makeTempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const { tools } = makeTools(dir)
  const list = Object.values(tools)
  assert.deepEqual(
    list.map((tool) => tool.name),
    ['progress_ingest', 'progress_audit', 'progress_export'],
  )
  assert.equal(new Set(list.map((tool) => tool.name)).size, 3)
  for (const tool of list) {
    assert.ok(tool.name.startsWith('progress_'))
    assert.ok(tool.description.length > 0)
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.output.render, 'function')
  }
})

test('resolveBaseDir defaults to $DSH_HOME/dsh-progress-payment and honors the explicit override', () => {
  assert.equal(plugin.resolveBaseDir({ DSH_HOME: '/tmp/dsh-home' }), path.join('/tmp/dsh-home', 'dsh-progress-payment'))
  assert.equal(
    plugin.resolveBaseDir({ DSH_HOME: '/tmp/dsh-home', DSH_PROGRESS_PAYMENT_HOME: '/tmp/progress-home' }),
    '/tmp/progress-home',
  )
})

test('apply() registers the tools and wires the documented write root', async (t) => {
  const dir = makeTempDir('dsh-progress-payment-apply-')
  const previous = process.env.DSH_PROGRESS_PAYMENT_HOME
  process.env.DSH_PROGRESS_PAYMENT_HOME = dir
  t.after(async () => {
    if (previous === undefined) delete process.env.DSH_PROGRESS_PAYMENT_HOME
    else process.env.DSH_PROGRESS_PAYMENT_HOME = previous
    await rm(dir, { recursive: true, force: true })
  })

  const registered = []
  await plugin.apply({ tools: { register(tool) { registered.push(tool) } } })
  assert.equal(plugin.name, 'dsh-progress-payment')
  assert.deepEqual(plugin.inject, ['tools'])
  assert.equal(registered.length, 3)

  const call = (name, args) => registered.find((tool) => tool.name === name).execute(args, { callId: 'apply' })
  const ingested = await call('progress_ingest', { declaration_csv: SAMPLE_DECLARATION, contract_csv: SAMPLE_CONTRACT })
  const audit = await call('progress_audit', { batch_id: ingested.batch_id })
  assert.equal(audit.summary.period_amount_cents, 5076360)
  const exported = await call('progress_export', { batch_id: ingested.batch_id, filename: 'apply.csv' })
  assert.ok(exported.path.startsWith(`${dir}${path.sep}exports${path.sep}`), exported.path)
  assert.equal(exported.rows, 8)
})

test('ingest -> audit -> export writes a BOM worksheet whose sha256 matches the file', async (t) => {
  const dir = makeTempDir('dsh-progress-payment-export-')
  t.after(() => rm(dir, { recursive: true, force: true }))
  const { call } = makeTools(dir)
  const ingested = await call('progress_ingest', {
    declaration_csv: SAMPLE_DECLARATION,
    contract_csv: SAMPLE_CONTRACT,
    source_name: 'declaration-2026-10.csv',
  })
  assert.equal(ingested.rows, 7)
  assert.equal(ingested.items, 6)
  assert.equal(ingested.contract_items, 6)
  assert.match(ingested.batch_id, /^pg_[0-9a-f]{16}$/)

  const exported = await call('progress_export', { batch_id: ingested.batch_id, filename: 'progress-audit-2026-10.csv' })
  const csv = await readFile(exported.path, 'utf8')
  assert.equal(csv.charCodeAt(0), 0xfeff)
  assert.equal(exported.sha256, createHash('sha256').update(csv).digest('hex'))
  assert.equal(exported.bytes, Buffer.byteLength(csv, 'utf8'))
  assert.equal(exported.rows, 8)
  assert.equal(exported.items, 6)
  assert.equal(exported.issues, 3)
  assert.match(csv, /是否计入/)
  assert.match(csv, /010101003,挖沟槽土方,m3,850,28\.00,120,520,3360\.00,14560\.00,61\.18,否,E_PROGRESS_DUP_ITEM/)
})

test('an unknown batch and an unsafe export filename fail with stable codes', async (t) => {
  const dir = makeTempDir('dsh-progress-payment-errors-')
  t.after(() => rm(dir, { recursive: true, force: true }))
  const { call } = makeTools(dir)
  await rejectsWithCode(assert, call('progress_audit', { batch_id: 'pg_missing' }), 'E_PROGRESS_BATCH_NOT_FOUND')

  const ingested = await call('progress_ingest', { declaration_csv: SAMPLE_DECLARATION, contract_csv: SAMPLE_CONTRACT })
  await rejectsWithCode(assert, call('progress_export', { batch_id: ingested.batch_id, filename: '../evil.csv' }), 'E_PROGRESS_PATH_INVALID')
  await rejectsWithCode(assert, call('progress_export', { batch_id: ingested.batch_id, filename: 'sub/dir.csv' }), 'E_PROGRESS_PATH_INVALID')
  await rejectsWithCode(assert, call('progress_audit', { batch_id: ingested.batch_id, price_tolerance_bps: -1 }), 'E_PROGRESS_OPTION_INVALID')
})

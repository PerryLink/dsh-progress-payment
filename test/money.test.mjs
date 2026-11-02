import test from 'node:test'
import assert from 'node:assert/strict'
import {
  amountCents,
  formatCents,
  formatQty,
  parseCents,
  parseQtyMilli,
  priceToleranceCents,
  ratioPct,
} from '../lib/core/money.js'

test('parseCents converts decimal amounts to integer cents', () => {
  assert.equal(parseCents('1234.56', 'price', 1), 123456)
  assert.equal(parseCents('3.5', 'price', 1), 350)
  assert.equal(parseCents('¥1,234', 'price', 1), 123400)
  assert.equal(parseCents('0', 'price', 1), 0)
})

test('parseCents rejects negative, over-precise and garbage amounts', () => {
  for (const raw of ['-1.00', '1.234', 'abc', '', '1,2,3.4.5']) {
    assert.throws(() => parseCents(raw, 'price', 7), (error) => {
      assert.equal(error.code, 'E_PROGRESS_CSV_ROW')
      assert.match(error.message, /第 7 行 price/)
      return true
    })
  }
})

test('parseQtyMilli converts up to three decimals and rejects negatives', () => {
  assert.equal(parseQtyMilli('25.92', 'qty', 1), 25920)
  assert.equal(parseQtyMilli('4.2', 'qty', 1), 4200)
  assert.equal(parseQtyMilli('300', 'qty', 1), 300000)
  assert.equal(parseQtyMilli('0.005', 'qty', 1), 5)
  assert.throws(() => parseQtyMilli('-1', 'qty', 1), { code: 'E_PROGRESS_CSV_ROW' })
  assert.throws(() => parseQtyMilli('1.2345', 'qty', 1), { code: 'E_PROGRESS_CSV_ROW' })
})

test('amountCents multiplies quantity by unit price and rounds to whole cents', () => {
  assert.equal(amountCents(25920, 48000), 1244160)
  assert.equal(amountCents(1005, 100), 101)
  assert.equal(amountCents(0, 48000), 0)
})

test('formatCents and formatQty are stable and compact', () => {
  assert.equal(formatCents(1244160), '12441.60')
  assert.equal(formatCents(0), '0.00')
  assert.equal(formatCents(-86400), '-864.00')
  assert.equal(formatQty(25920), '25.92')
  assert.equal(formatQty(4200), '4.2')
  assert.equal(formatQty(300000), '300')
  assert.equal(formatQty(5), '0.005')
})

test('ratioPct guards a zero total and allows over-100 percentages', () => {
  assert.equal(ratioPct(61414500, 72575000), 84.62)
  assert.equal(ratioPct(6191500, 5795000), 106.84)
  assert.equal(ratioPct(1, 0), 0)
})

test('priceToleranceCents turns basis points into cents and defaults to exact', () => {
  assert.equal(priceToleranceCents(5500, 0), 0)
  assert.equal(priceToleranceCents(5500, 2000), 1100)
  assert.equal(priceToleranceCents(5500, -5), 0)
})

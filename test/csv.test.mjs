import test from 'node:test'
import assert from 'node:assert/strict'
import { csvField, parseCsv, toCsv } from '../lib/core/csv.js'

test('parseCsv handles quotes, doubled quotes, embedded newlines, CRLF and a BOM', () => {
  const text = '\uFEFFa,b\r\n"x,y","q""z"\r\n"line1\nline2",2\r\n'
  assert.deepEqual(parseCsv(text), [
    ['a', 'b'],
    ['x,y', 'q"z'],
    ['line1\nline2', '2'],
  ])
})

test('parseCsv drops blank rows and pads nothing implicitly', () => {
  const rows = parseCsv('a,b\n\n , \n1,2\n')
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['1', '2'],
  ])
})

test('parseCsv rejects an unclosed quote with E_PROGRESS_CSV_ROW', () => {
  assert.throws(() => parseCsv('a,b\n"x,1\n'), (error) => {
    assert.equal(error.code, 'E_PROGRESS_CSV_ROW')
    return true
  })
})

test('toCsv quotes commas, quotes and newlines and ends with one newline', () => {
  assert.equal(csvField('plain'), 'plain')
  assert.equal(csvField('a,b'), '"a,b"')
  assert.equal(csvField('a"b'), '"a""b"')
  assert.equal(toCsv([['a', 'b,c'], ['d"e', 'f']]), 'a,"b,c"\n"d""e",f\n')
  assert.equal(toCsv([]), '')
})

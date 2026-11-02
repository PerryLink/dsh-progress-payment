import { ProgressError } from './errors.js'

/** RFC 4180 field escaping: quote on comma, quote, CR or LF and double embedded quotes. */
const CSV_NEEDS_QUOTES = /[",\r\n]/

export function csvField(value: string): string {
  return CSV_NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Build a UTF-8 CSV body with a trailing newline; empty input yields an empty string. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return ''
  return `${rows.map((row) => row.map(csvField).join(',')).join('\n')}\n`
}

/**
 * Parse RFC 4180-style CSV: quoted fields, doubled quotes, embedded CR/LF and a
 * UTF-8 BOM. Blank lines and rows whose every cell is empty are dropped. A
 * quote that never closes is a row-level error (`E_PROGRESS_CSV_ROW`), not a
 * silently truncated table.
 */
export function parseCsv(text: string): string[][] {
  if (typeof text !== 'string') throw new ProgressError('E_PROGRESS_CSV_ROW', 'CSV 内容不是文本')
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        inQuotes = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }
    if (char === '"' && field === '') {
      inQuotes = true
      index += 1
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      index += 1
      continue
    }
    if (char === '\r') {
      index += 1
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      index += 1
      continue
    }
    field += char
    index += 1
  }
  if (inQuotes) throw new ProgressError('E_PROGRESS_CSV_ROW', 'CSV 里有引号没有闭合')
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

/** Normalise a header cell: trim, lower-case, drop spaces and a UTF-8 BOM. */
export function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '')
}

/** Find the first alias present in the header row; -1 when the column is absent. */
export function headerIndex(header: readonly string[], aliases: readonly string[]): number {
  for (const alias of aliases) {
    const index = header.indexOf(normalizeHeader(alias))
    if (index >= 0) return index
  }
  return -1
}

/** Pad short rows to the header width; extra cells beyond the header are ignored. */
export function cell(row: readonly string[], index: number): string {
  return index >= 0 ? (row[index] ?? '').trim() : ''
}

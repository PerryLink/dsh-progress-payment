import { ProgressError } from './errors.js'

/** 1 unit of quantity is stored as 1000 milli-units; money is stored as integer cents. */
export const QTY_SCALE = 1000

const MONEY = /^(\d+)(?:\.(\d{1,2}))?$/
const QTY = /^(\d+)(?:\.(\d{1,3}))?$/

function cleanNumber(raw: string): string {
  return String(raw).trim().replace(/[¥￥,\s]/g, '')
}

/** Parse a decimal amount into integer cents. Negative amounts and >2 decimals are rejected. */
export function parseCents(raw: string, field: string, row: number): number {
  const value = cleanNumber(raw)
  if (value === '') throw new ProgressError('E_PROGRESS_CSV_ROW', `第 ${row} 行 ${field} 为空`)
  const match = MONEY.exec(value)
  if (!match) throw new ProgressError('E_PROGRESS_CSV_ROW', `第 ${row} 行 ${field}=${JSON.stringify(raw)} 不是金额`)
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) throw new ProgressError('E_PROGRESS_CSV_ROW', `第 ${row} 行 ${field}=${JSON.stringify(raw)} 太大`)
  return cents
}

/** Parse a decimal quantity into integer milli-units (3 decimals). Negative quantities are rejected. */
export function parseQtyMilli(raw: string, field: string, row: number): number {
  const value = cleanNumber(raw)
  if (value === '') throw new ProgressError('E_PROGRESS_CSV_ROW', `第 ${row} 行 ${field} 为空`)
  const match = QTY.exec(value)
  if (!match) throw new ProgressError('E_PROGRESS_CSV_ROW', `第 ${row} 行 ${field}=${JSON.stringify(raw)} 不是数量`)
  const milli = Number(match[1]) * QTY_SCALE + Number((match[2] ?? '').padEnd(3, '0'))
  if (!Number.isSafeInteger(milli)) throw new ProgressError('E_PROGRESS_CSV_ROW', `第 ${row} 行 ${field}=${JSON.stringify(raw)} 太大`)
  return milli
}

/** Quantity x contract unit price, rounded half-up to whole cents. */
export function amountCents(qtyMilli: number, unitPriceCents: number): number {
  const raw = qtyMilli * unitPriceCents
  if (!Number.isSafeInteger(raw)) throw new ProgressError('E_PROGRESS_CSV_ROW', '金额超出可安全计算的范围')
  return Math.round(raw / QTY_SCALE)
}

/** Format integer cents as `1234.56` (always two decimals). */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Format integer milli-units as a compact decimal: `25.92`, `4.2`, `300`. */
export function formatQty(milli: number): string {
  const sign = milli < 0 ? '-' : ''
  const abs = Math.abs(milli)
  const whole = Math.floor(abs / QTY_SCALE)
  const fraction = abs % QTY_SCALE
  if (fraction === 0) return `${sign}${whole}`
  return `${sign}${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}`
}

/** Percentage with two decimals; a non-positive total yields 0 instead of Infinity. */
export function ratioPct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0
  return Math.round((part * 10000) / total) / 100
}

/** Absolute price tolerance in cents for a basis-point setting (0 bps = exact). */
export function priceToleranceCents(contractPriceCents: number, bps: number): number {
  if (!Number.isFinite(bps) || bps <= 0) return 0
  return Math.round((contractPriceCents * bps) / 10000)
}

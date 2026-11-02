/** Every user-facing failure is a stable code plus one human sentence and one next action. */
export type ProgressErrorCode =
  | 'E_PROGRESS_CSV_EMPTY'
  | 'E_PROGRESS_CSV_ROW'
  | 'E_PROGRESS_BATCH_NOT_FOUND'
  | 'E_PROGRESS_OPTION_INVALID'
  | 'E_PROGRESS_PATH_INVALID'
  | 'E_PROGRESS_PATH_NOT_ALLOWED'
  | 'E_PROGRESS_EXPORT_FAILED'

interface HumanMessage {
  text: string
  next: string
}

const PROGRESS_HUMAN: Record<ProgressErrorCode, HumanMessage> = {
  E_PROGRESS_CSV_EMPTY: {
    text: '这个 CSV 是空的，既没有表头也没有数据',
    next: '确认文件不是 0 字节，并且第一行是表头、后面至少有一行数据',
  },
  E_PROGRESS_CSV_ROW: {
    text: '申报或合同 CSV 的表头/某一行读不懂',
    next: '按 README 的列名补齐表头；数量写纯数字（最多 3 位小数），单价写金额（最多 2 位小数），不要带单位',
  },
  E_PROGRESS_BATCH_NOT_FOUND: {
    text: '找不到这批申报',
    next: '先运行 progress.ingest 导入 CSV 拿到 batch_id，再运行 progress.audit 或 progress.export',
  },
  E_PROGRESS_OPTION_INVALID: {
    text: '审核参数不合法',
    next: 'price_tolerance_bps 传 0 或正整数（单位：万分之一），不传表示 0',
  },
  E_PROGRESS_PATH_INVALID: {
    text: '导出文件名不安全',
    next: '只传一个由字母、数字、点、下划线或短横线组成的文件名，例如 progress-2026-10.csv',
  },
  E_PROGRESS_PATH_NOT_ALLOWED: {
    text: '导出路径越过了导出目录',
    next: '只传一个文件名，不要带 ../、目录分隔符或符号链接',
  },
  E_PROGRESS_EXPORT_FAILED: {
    text: '审核底稿没有写出去',
    next: '确认 $DSH_HOME/dsh-progress-payment 指向可写目录后重试',
  },
}

/** `human sentence（E_CODE）｜Next: one action｜detail` — the only text shown to end users. */
export function progressErrorMessage(code: ProgressErrorCode, detail?: string): string {
  const human = PROGRESS_HUMAN[code]
  return `${human.text}（${code}）｜下一步：${human.next}${detail ? `｜细节：${detail}` : ''}`
}

export class ProgressError extends Error {
  readonly code: ProgressErrorCode
  constructor(code: ProgressErrorCode, detail?: string) {
    super(progressErrorMessage(code, detail))
    this.name = 'ProgressError'
    this.code = code
  }
}

import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createTools } from '../../lib/plugin/tools.js'

export class MemoryTable {
  constructor() {
    this.map = new Map()
  }
  get(key) {
    return this.map.get(key)
  }
  entries() {
    return this.map.entries()
  }
  put(key, value) {
    this.map.set(key, value)
  }
}

export function makeTempDir(prefix = 'dsh-progress-payment-test-') {
  return mkdtempSync(path.join(os.tmpdir(), prefix))
}

export function makeTools(baseDir) {
  const batches = new MemoryTable()
  const tools = Object.fromEntries(createTools({ batches, baseDir }).map((tool) => [tool.name, tool]))
  const call = (name, args) => tools[name].execute(args, { callId: 'test', agent: { id: 'test' } })
  return { tools, call, batches }
}

export const DECLARATION_HEADER = '清单编码,名称,单位,合同量,合同单价,本期完成量,累计完成量'

export const SAMPLE_DECLARATION = `${DECLARATION_HEADER}
010101001,平整场地,m2,1200,3.50,300,900
010101003,挖沟槽土方,m3,850,28.00,120,520
010401001,混凝土基础,m3,260,480.00,25.92,240.5
010402001,矩形柱,m3,95,610.00,12,101.5
010515001,现浇构件钢筋,t,80,5200.00,4.2,62.4
011702001,基础模板,m2,1800,65.00,86.4,1720
010101003,挖沟槽土方,m3,850,28.00,120,520
`

export const SAMPLE_CONTRACT = `清单编码,合同量,合同单价
010101001,1200,3.50
010101003,850,28.00
010401001,260,480.00
010402001,95,610.00
010515001,80,5200.00
011702001,1800,55.00
`

export const CLEAN_DECLARATION = `${DECLARATION_HEADER}
A-1,混凝土,m3,100,500.00,20,60
A-2,钢筋,t,10,5000.00,2,6
`

export const CLEAN_CONTRACT = `清单编码,合同量,合同单价
A-1,100,500.00
A-2,10,5000.00
`

export function declaration(rows) {
  return `${DECLARATION_HEADER}\n${rows.join('\n')}\n`
}

export function contract(rows) {
  return `清单编码,合同量,合同单价\n${rows.join('\n')}\n`
}

/** Assert that a promise rejects with a stable progress error code. */
export async function rejectsWithCode(assert, promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`)
    return true
  })
}

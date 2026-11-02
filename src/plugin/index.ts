import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { createTools } from './tools.js'
import type { ProgressBatch } from '../core/progress.js'

export const name = 'dsh-progress-payment'
export const inject = ['tools']

/** Local write root: `$DSH_PROGRESS_PAYMENT_HOME`, else `$DSH_HOME/dsh-progress-payment`. */
export function resolveBaseDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.DSH_PROGRESS_PAYMENT_HOME?.trim()
  if (override) return override
  const dshHome = env.DSH_HOME?.trim()
  return path.join(dshHome || process.cwd(), 'dsh-progress-payment')
}

/** Session-scoped batch table; tests may inject their own Map-backed implementation. */
export function createBatchTable(): { get(key: string): ProgressBatch | undefined; put(key: string, value: ProgressBatch): void } {
  const map = new Map<string, ProgressBatch>()
  return {
    get: (key) => map.get(key),
    put: (key, value) => {
      map.set(key, value)
    },
  }
}

export async function apply(ctx: Context): Promise<void> {
  for (const tool of createTools({ batches: createBatchTable(), baseDir: resolveBaseDir() })) ctx.tools.register(tool)
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the bundled sample declaration has 6 unique items in 7 rows plus a 6-item contract baseline', async () => {
  const declarationPath = path.join(packageRoot, 'samples', 'quickstart', 'input', 'declaration-2026-10.csv')
  const contractPath = path.join(packageRoot, 'samples', 'quickstart', 'input', 'contract-baseline.csv')
  const declaration = await readFile(declarationPath, 'utf8')
  const contract = await readFile(contractPath, 'utf8')
  const declarationRows = declaration.trim().split('\n')
  const contractRows = contract.trim().split('\n')
  assert.equal(declarationRows.length, 8)
  assert.equal(contractRows.length, 7)
  const codes = declarationRows.slice(1).map((line) => line.split(',')[0])
  assert.equal(new Set(codes).size, 6)
  assert.ok((await stat(declarationPath)).size > 100)
  assert.ok((await stat(contractPath)).size > 50)
})

test('quickstart --check reproduces the committed golden result', () => {
  const result = spawnSync(process.execPath, ['samples/quickstart/run.mjs', '--check'], {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /declaration: .* \(7 rows \/ 6 items\)/)
  assert.match(result.stdout, /period amount: 50763\.60 CNY \(declared 51627\.60\)/)
  assert.match(result.stdout, /cumulative: 614145\.00 CNY \/ contract 725750\.00 = 84\.62%/)
  assert.match(result.stdout, /issues: 3 \(over qty 1, price mismatch 1, duplicate 1\)/)
  assert.match(result.stdout, /golden samples\/quickstart\/expected\/result\.json matches/)
  assert.match(result.stdout, /quickstart ok/)
})

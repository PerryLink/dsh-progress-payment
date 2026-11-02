# Evidence — dsh-progress-payment 0.1.0-alpha.1

All runs are local and offline, over synthetic declarations. No customer data, no network call,
no model call. No `git commit` and no `npm publish` were performed.

## Environment

- Node `v24.22.1`
- pnpm `11.28.5`
- TypeScript `7.0.2` (NodeNext, strict)
- Runtime dependencies: none (Node standard library + host contracts)
- Date: 2026-11-02 (Asia/Shanghai)

## Commands and results

| Command | Result |
|---|---|
| `pnpm build` | exit 0, `tsc -p tsconfig.json` emits `lib/` |
| `pnpm typecheck` | exit 0 |
| `node --test test/*.test.mjs` | 32 tests, 32 pass, 0 fail |
| `node samples/quickstart/run.mjs --check` | golden `expected/result.json` matches |
| `node scripts/gate.mjs` | lint ok, acceptance ok, 15/15 acceptance rows pass |
| `npm pack --dry-run --json` | 32 files, no publish |

## Local Package Standard v1 score

The package is intentionally **not** added to `04-build/dsh-plugins/family.json` (it is not in the
committed roster yet, and no market package page exists). To verify the standard locally, the
official `04-build/dsh-plugins/scripts/score-packages.mjs` was copied to a temporary path, pointed
at a temporary one-item family file, and run against this checkout:

```
PS1 scores: 1 packages | green 1 / yellow 0 / red 0
domain packages: 1, avg 10.0
 10 green  dsh-progress-payment
```

```
name,status,scope,page,sample,prompt,expected,permissions,errors,evidence,total,grade,missing
dsh-progress-payment,active,domain,1,2,1,1,2,1,2,10,green,""
```

Every scored category is non-zero; the score is 10/10 against the same rules the family uses.

## Screenshot / golden hashes

| Artifact | SHA-256 |
|---|---|
| `docs/assets/quickstart.png` | `beeda8ec806af9221faf8f253cff5191232f0580fa6a6012112ee48f09ba8854` |
| `docs/assets/quickstart.log` | `582cc7f92d0a8ca7d7ee6030e5d1607b6c3609d0f55dd745f5296b9fd99f6710` |
| `samples/quickstart/expected/result.json` | `bdaa9e845c43bab3e29b0e48dddfb801af505e6e552ffc3b12351f59c12feff5` |
| `ACCEPTANCE.csv` quickstart row | uses the `expected/result.json` hash above |

The screenshot was rendered by `04-build/dsh-plugins/scripts/render-capture.py` from the real
captured terminal output in `docs/assets/quickstart.log`; no output text was invented. The CJK
font used for rendering was the local `msyh.ttc`; the capture text is unchanged.

## Quickstart numbers

7 declaration rows / 6 bill items + 6 contract-baseline items:

- Period amount: **50,763.60 CNY** (`5076360` cents); declared price basis: 51,627.60 CNY.
- Cumulative amount: **614,145.00 CNY** (`61414500` cents) / contract 725,750.00 CNY = **84.62%**.
- Issues: 3 blocking — `E_PROGRESS_OVER_QTY` (cumulative 101.5 > 95 m³), `E_PROGRESS_PRICE_MISMATCH`
  (65.00 vs 55.00), `E_PROGRESS_DUP_ITEM` (item code 010101003 twice).
- Worksheet: 8 rows (header + 7), 1,291 bytes, duplicate row marked `是否计入=否`.

## Error-path coverage

- `E_PROGRESS_CSV_ROW` — missing column, bad number, >2 decimals for money, duplicate contract code, unclosed quote.
- `E_PROGRESS_CSV_EMPTY` — empty file or header-only file.
- `E_PROGRESS_OVER_QTY` — period over contract and cumulative over contract.
- `E_PROGRESS_PRICE_MISMATCH` — declared price differs from the contract baseline (tolerance configurable).
- `E_PROGRESS_DUP_ITEM` — an item code appears more than once.
- `E_PROGRESS_CONTRACT_MISSING` / `E_PROGRESS_CONTRACT_MISMATCH` — item absent from, or quantity differs from, the baseline.
- `E_PROGRESS_QTY_INCONSISTENT` — cumulative quantity below the period quantity.
- `E_PROGRESS_BATCH_NOT_FOUND` — unknown `batch_id`.
- `E_PROGRESS_OPTION_INVALID` — negative/NaN `price_tolerance_bps`.
- `E_PROGRESS_PATH_INVALID` / `E_PROGRESS_PATH_NOT_ALLOWED` / `E_PROGRESS_EXPORT_FAILED` — unsafe export filename, path escape, write failure.

## Scope

alpha / public-synthetic / partial / not counted / not GA. This package does not replace estimating
software, settlement review or legal advice, and it does not approve variations.

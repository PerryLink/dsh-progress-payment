<div align="center">

# dsh-progress-payment

> **Official repository.** The only official repository of this package, maintained by PerryLink. Same-name repositories under other accounts are not affiliated. Apache-2.0.

[![npm](https://img.shields.io/npm/v/dsh-progress-payment)](https://www.npmjs.com/package/dsh-progress-payment)
[![CI](https://github.com/PerryLink/dsh-progress-payment/actions/workflows/ci.yml/badge.svg)](https://github.com/PerryLink/dsh-progress-payment/actions)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**Audit a construction progress-payment declaration against the contract baseline: integer-cent amounts, cumulative ratio, over-quantity / price / duplicate issues → review worksheet CSV.**

> **Status: alpha / public-synthetic / partial / not counted / not GA.** No customer data, customer evidence, or production-readiness claim.

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

```sh
dsh plugin --profile <profile> add dsh-progress-payment
```

</div>

## One-liner

Check this period's declared quantities and prices against the contract, compute the period and cumulative amounts plus the cumulative ratio, list over-quantity, price-mismatch and duplicate bill items, and export a review worksheet CSV.

## Fit / not a fit

- **Fits:** quantity surveyors, cost engineers and site supervisors who audit a monthly progress payment with tens to thousands of bill items; checking quantity and unit price before signing the certificate; keeping the declaration, contract baseline and issue list in one reviewable CSV.
- **Does not fit:** replacing estimating/settlement software or legal advice; declarations with no contract baseline; deciding whether a change order is valid (this package flags over-quantity but does not approve variations); OCR of scanned PDFs (CSV only).

## Input

- **Declaration CSV:** UTF-8, header `清单编码,名称,单位,合同量,合同单价,本期完成量,累计完成量` (Chinese) or `item_code,item_name,unit,contract_qty,contract_unit_price,period_qty,cumulative_qty` (English). Column order is free.
- **Contract baseline CSV (optional):** `清单编码,合同量,合同单价` (or `item_code,contract_qty,contract_unit_price`). When supplied it is authoritative; otherwise the declared contract quantity/price is used.
- **Precision:** quantities up to 3 decimals, prices/amounts up to 2 decimals. Money is computed in **integer cents**, never float accumulation.
- **Sample:** `samples/quickstart/input/declaration-2026-10.csv` (7 rows / 6 bill items) and `contract-baseline.csv` (6 items). Synthetic only.

## Output

- `progress.ingest`: `batch_id`, rows, item count, contract-item count. Session memory only; no file is written.
- `progress.audit`: per item the contract quantity/price, period quantity, cumulative quantity, period amount, cumulative amount, cumulative ratio, plus a row-ordered issue list (`E_PROGRESS_*`). Amounts are integer cents.
- `progress.export`: review worksheet CSV (UTF-8 BOM, opens cleanly in Excel), one row per declaration line with duplicate rows marked `是否计入=否`; written to `$DSH_HOME/dsh-progress-payment/exports/`; returns path, rows, bytes and sha256.
- The source CSVs are never modified; no upload, no network, no model call.

## Example

Paste this one line into the agent:

> 帮我审一下这期进度款申报，按合同基准核对超量和单价，把问题清单导成底稿。

Reproduce the bundled sample and compare with the golden file:

```sh
node samples/quickstart/run.mjs --check
```

![dsh-progress-payment quickstart terminal output](docs/assets/quickstart.png)

This is a real run: 7 declaration rows / 6 bill items, period amount **50,763.60 CNY**, cumulative **614,145.00 CNY (84.62%)**, and 3 blocking issues — the rectangular column exceeded its contract quantity (101.5 vs 95 m³), the formwork price was 65.00 against a 55.00 baseline, and one item code appeared twice. `samples/quickstart/expected/result.json` is the real stdout of `node samples/quickstart/run.mjs --json`, not hand-written.

## Permissions

Read: the declaration CSV and contract baseline CSV the user names (sample: `samples/quickstart/input/`); nothing else.
Write: `$DSH_HOME/dsh-progress-payment/exports/` (review worksheet CSV) only; source files are not modified.
Network: no.
External systems: none.

`progress.ingest` and `progress.audit` are **R0** (read-only; `ingest` keeps the batch in session memory). `progress.export` is **R1** (local write under `$DSH_HOME/dsh-progress-payment`). `DSH_PROGRESS_PAYMENT_HOME` can override the local write root for tests.

## FAQ

### 1. Why does the period amount differ from my own calculation?

The audit prices every line at the **contract baseline unit price**, not the declared price. A declared price that differs raises `E_PROGRESS_PRICE_MISMATCH` and both amounts are reported; the delta is `summary.price_adjustment_cents`. Quantity × price is rounded half-up to whole cents.

### 2. Which contract quantity is the ceiling?

The contract baseline wins when supplied; the declared contract quantity is used only when no baseline is given. Both `period_qty > contract_qty` and `cumulative_qty > contract_qty` raise `E_PROGRESS_OVER_QTY`, distinguished by `kind` (`period_over_contract` / `cumulative_over_contract`). Over-quantity is not silently deducted — it needs a variation or settlement.

### 3. Do duplicate item codes get paid twice?

No. Only the first occurrence counts toward the period amount; the other rows are marked `是否计入=否` in the worksheet and raise `E_PROGRESS_DUP_ITEM`. Which row is the right one still needs a human decision.

### 4. Does it modify or upload my CSV?

No. It reads the named CSVs, writes only under `$DSH_HOME/dsh-progress-payment/exports/`, and never uses the network or a model call.

### 5. Can it read Excel directly?

No. Save the sheet as **CSV UTF-8** first. Excel-written UTF-8 CSVs with a BOM are accepted.

## Version

`0.1.0` · 32 tests pass (`node --test test/*.test.mjs`).

> ⭐ If this helps, a star makes it easier for the next person to find it. Nothing is gated behind it.

## Install

```sh
dsh plugin --profile <profile> add dsh-progress-payment
dsh --profile <profile> --dump-config | grep dsh-progress-payment
```

Uninstall:

```sh
dsh plugin --profile <profile> remove dsh-progress-payment
```

### Install channels

- **npm (recommended):** `dsh plugin --profile <profile> add dsh-progress-payment`
- **git channel:** `dsh plugin --profile <profile> add github:PerryLink/dsh-progress-payment`
- **tarball:** `pnpm pack`, then `dsh plugin --profile <profile> add ./dsh-progress-payment-<version>.tgz`

## Tools

Tool names are stable API; descriptions stay in English to match runtime output.

| Tool | Purpose | Risk |
|---|---|---|
| `progress.ingest` | Import a declaration CSV and an optional contract baseline; returns `batch_id`; session memory only | R0 |
| `progress.audit` | Period amount, cumulative ratio, over-quantity, price mismatch, cumulative-over-contract and duplicate items; returns the issue list; integer cents | R0 |
| `progress.export` | Re-run the audit and write the review worksheet CSV (UTF-8 BOM); returns path, rows, sha256 | R1 local write |

## Audit rules

1. **Amount:** `period amount = period qty × contract unit price`, rounded half-up to whole cents; cumulative is computed the same way.
2. **Cumulative ratio:** `cumulative amount ÷ contract amount × 100`, two decimals; a zero contract amount yields 0.
3. **Over quantity:** `period_qty > contract_qty` or `cumulative_qty > contract_qty` → `E_PROGRESS_OVER_QTY`.
4. **Price mismatch:** declared contract unit price ≠ baseline unit price → `E_PROGRESS_PRICE_MISMATCH`; `price_tolerance_bps` relaxes it (default 0 = exact).
5. **Cumulative > contract quantity:** the `cumulative_over_contract` kind; the ratio can exceed 100%.
6. **Duplicate item:** the same `item_code` appears more than once → `E_PROGRESS_DUP_ITEM`; only the first occurrence is counted.
7. **Missing / mismatched baseline:** `E_PROGRESS_CONTRACT_MISSING` / `E_PROGRESS_CONTRACT_MISMATCH`.
8. **Cumulative below period:** `E_PROGRESS_QTY_INCONSISTENT`, usually a wrong opening cumulative.

## Quick start

```sh
# 1) import the declaration (tool surface)
#    progress.ingest({ declaration_csv, contract_csv })

# 2) audit (tool surface)
#    progress.audit({ batch_id })

# 3) export the worksheet (tool surface)
#    progress.export({ batch_id, filename: "progress-audit-2026-10.csv" })
```

Or run the sample:

```sh
node samples/quickstart/run.mjs --check
```

## Acceptance evidence

Public/synthetic fixtures live in `samples/quickstart/`; `ACCEPTANCE.csv` records the checks. Every row is `counted=false` except the quickstart row.

| req_id | metric | threshold | actual | pass | source | counted |
|---|---|---|---|---|---|---|
| PG-A02 | period amount (cents) | 5076360 | 5076360 | true | public/synthetic | false |
| PG-A06 | price mismatch | E_PROGRESS_PRICE_MISMATCH x1 | 1 | true | public/synthetic | false |
| PS1-QS01 | quickstart golden | 1/1 | 1 | true | synthetic/quickstart | true |

*Fixture-backed rows, not a customer run; no output is invented.*

## Limits and known limitations

- **Quantity/price only:** no judgement on variations, claims, retention, tax or pay ratios; those still need the contract and a human.
- **One price basis:** the declaration's `contract_unit_price` is the pricing basis; there is no current-price or index-price column.
- **No automatic duplicate choice:** duplicates are listed and only the first row is counted; a human must pick the right one.
- **Amount ceiling:** a single line must stay inside the JavaScript safe-integer range; otherwise `E_PROGRESS_CSV_ROW`.
- **CSV only:** no xlsx, PDF or scanned documents.
- Public/synthetic samples only; alpha/partial, not counted, no GA or production-readiness claim.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm typecheck
node --test test/*.test.mjs
node scripts/gate.mjs
```

## Compatibility

| Surface | Status |
|---|---|
| Harness | `dsh >=0.2.1-rc.3 <0.4.0` |
| Node | `>=24.9.0 <25` |
| Platforms | All; local files only |
| Data | No network, no model call, no upload |

## Related work

- [dsh-ifc-qto](https://github.com/PerryLink/dsh-ifc-qto) (model quantities, a cross-check for declared quantities)
- [dsh-ap-three-way](https://github.com/PerryLink/dsh-ap-three-way) (payment invoice / PO / GRN three-way match)
- [Domain index](https://perrylink.github.io/dsh-plugins/)

## License

Apache-2.0. See `LICENSE`, `NOTICE`, `THIRD-PARTY-NOTICES`.

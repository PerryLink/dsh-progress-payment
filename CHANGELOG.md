# Changelog

## [0.1.0] — 2026-11-03

### Stable

- First non-alpha release: tool names and the CLI surface are covered by a
  compatibility promise (breaking changes require a minor bump).
- Ships a quickstart sample, a one-line prompt, a permission block and real captures.

## 0.1.0-alpha.1 — 2026-11-02

- First public alpha of `dsh-progress-payment`.
- `progress.ingest`: declaration CSV (7 columns, Chinese or English headers) plus an optional contract baseline; deterministic `batch_id`; session memory only.
- `progress.audit`: integer-cent period/cumulative amounts, cumulative ratio, over-contract quantity, declared-vs-baseline unit price, cumulative-over-contract, duplicate item codes, missing/mismatched baseline and cumulative-below-period checks; returns a row-ordered issue list.
- `progress.export`: UTF-8 BOM review worksheet under `$DSH_HOME/dsh-progress-payment/exports/` via `safeExportPath`; duplicate rows marked `是否计入=否`.
- Synthetic 6-item declaration (7 rows) + contract baseline, real-output golden and terminal screenshot.
- No network, no OCR, no xlsx: CSV in, CSV out, amounts in integer cents.

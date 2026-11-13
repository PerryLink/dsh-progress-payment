# Changelog

## [0.2.0] — 2026-11-13

### Breaking

- **Tool names now use underscores instead of dots.** The separator in every
  name changed from `.` to `_`: `progress` + `.` + `ingest` → `progress_ingest`,
  `progress` + `.` + `audit` → `progress_audit`, `progress` + `.` + `export` →
  `progress_export`. The provider validates every `tools[].name` against
  `^[a-zA-Z0-9_-]+$`; a dotted name makes it reject the whole `tools` array
  (`Invalid 'tools[N].name'`), so the plugin registered but no request carrying
  the tools could succeed. Dots cannot be put on the wire, so no compatibility
  alias is kept: callers must migrate to the underscore names. This is the minor
  bump that the 0.1.x compatibility promise requires for a breaking change.
- Added `test/tool-name-wire.test.mjs`: every registered tool name must match
  `^[a-zA-Z0-9_-]+$`, contain no dot, stay in the `progress_` namespace and be
  unique.
- README (five languages), `TROUBLESHOOTING.md`, the docs diagrams, the
  quickstart runner, the acceptance/lint scripts and the source/tests were
  updated with the rename.

## [0.1.0] — 2026-11-03

### Stable

- First non-alpha release: tool names and the CLI surface are covered by a
  compatibility promise (breaking changes require a minor bump).
- Ships a quickstart sample, a one-line prompt, a permission block and real captures.

## 0.1.0-alpha.1 — 2026-11-02

- First public alpha of `dsh-progress-payment`.
- `progress_ingest`: declaration CSV (7 columns, Chinese or English headers) plus an optional contract baseline; deterministic `batch_id`; session memory only.
- `progress_audit`: integer-cent period/cumulative amounts, cumulative ratio, over-contract quantity, declared-vs-baseline unit price, cumulative-over-contract, duplicate item codes, missing/mismatched baseline and cumulative-below-period checks; returns a row-ordered issue list.
- `progress_export`: UTF-8 BOM review worksheet under `$DSH_HOME/dsh-progress-payment/exports/` via `safeExportPath`; duplicate rows marked `是否计入=否`.
- Synthetic 6-item declaration (7 rows) + contract baseline, real-output golden and terminal screenshot.
- No network, no OCR, no xlsx: CSV in, CSV out, amounts in integer cents.

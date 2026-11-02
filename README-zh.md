<div align="center">

# dsh-progress-payment

> **官方仓库。** 本包唯一官方仓库，由 PerryLink 维护；其他账号下的同名仓库与本项目无关。Apache-2.0。

[![npm](https://img.shields.io/npm/v/dsh-progress-payment)](https://www.npmjs.com/package/dsh-progress-payment)
[![CI](https://github.com/PerryLink/dsh-progress-payment/actions/workflows/ci.yml/badge.svg)](https://github.com/PerryLink/dsh-progress-payment/actions)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**按合同基准确认本期进度款：金额整数分、累计比例、超量/单价/重复项问题清单 → 审核底稿 CSV。**

> **状态：alpha / 公开合成 / partial / not counted / 非 GA。** 不含客户数据、客户证据，也不作生产可用声明。

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

```sh
dsh plugin --profile <profile> add dsh-progress-payment
```

</div>

## 一句话

把本期进度款申报按合同基准逐项核对，算出本期金额和累计比例，列出超量、单价不符和重复清单项，再导出审核底稿 CSV。

## 适合 / 不适合

- **适合**：总包、分包、业主方的造价和监理人员，每期几十到几千条清单项的进度款申报；先核对量和单价，再决定本期签认多少；把申报、合同基准和问题清单留成一份可复核的 CSV 底稿。
- **不适合**：替代计价软件、结算审核或法律意见；没有合同基准的手工报量；判断变更签证是否成立（本包只按合同基准提示超量，不替你做变更审批）；扫描件/PDF/图片的 OCR（只收 CSV）。

## 输入

- **申报 CSV**：UTF-8，表头含 `清单编码,名称,单位,合同量,合同单价,本期完成量,累计完成量`；也接受英文表头 `item_code,item_name,unit,contract_qty,contract_unit_price,period_qty,cumulative_qty`，列顺序随意。
- **合同基准 CSV**（可选）：`清单编码,合同量,合同单价`（英文 `item_code,contract_qty,contract_unit_price`）。给了基准就以基准为权威；不给就用申报里的合同量/单价。
- **格式约定**：数量最多 3 位小数，单价/金额最多 2 位小数；金额内部按**整数分**计算，不用浮点累加。
- **样例**：`samples/quickstart/input/declaration-2026-10.csv`（7 行 / 6 个清单项）和 `contract-baseline.csv`（6 项），全部为合成数据（虚构清单编码和金额）。

## 输出

- `progress.ingest`：`batch_id`、行数、清单项数、合同基准项数；只存在当前会话内存里，不落盘。
- `progress.audit`：每个清单项的合同量/单价、本期完成量、累计完成量、本期金额、累计金额、累计比例，加一份按行号排序的问题清单（`E_PROGRESS_*`）；金额都是整数分。
- `progress.export`：审核底稿 CSV（UTF-8 BOM，Excel 直接打开不乱码），一行一条申报记录，重复行标 `是否计入=否`；写到 `$DSH_HOME/dsh-progress-payment/exports/`，返回路径、行数、字节数和 sha256。
- **不改原 CSV**，不上传、不联网、不调用模型。

## 示例

直接复制下面这句：

> 帮我审一下这期进度款申报，按合同基准核对超量和单价，把问题清单导成底稿。

用自带样例复跑并核对金标：

```sh
node samples/quickstart/run.mjs --check
```

![dsh-progress-payment quickstart 真实运行输出](docs/assets/quickstart.png)

样例是一次真实运行：7 行申报 / 6 个清单项，本期金额 **50,763.60 CNY**，累计 **614,145.00 CNY（84.62%）**，3 个阻塞问题——矩形柱累计 101.5 m³ 超合同量 95 m³、基础模板申报单价 65.00 与合同基准 55.00 不符、挖沟槽土方重复出现 2 次。金标 `samples/quickstart/expected/result.json` 由 `node samples/quickstart/run.mjs --json` 真实产生，不是手写。

## 权限

读：用户指定的申报 CSV 和合同基准 CSV（样例 `samples/quickstart/input/`）；不读其他目录。
写：`$DSH_HOME/dsh-progress-payment/exports/`（审核底稿 CSV）；不改原文件。
联网：否。
外部系统：无。

`progress.ingest`、`progress.audit` 标 **R0**（只读；`ingest` 只写入当前会话内存，不落盘）；`progress.export` 标 **R1**（本地写，只写 `$DSH_HOME/dsh-progress-payment` 下的 `exports/`）。可用 `DSH_PROGRESS_PAYMENT_HOME` 覆盖本地写根目录（测试用），默认严格等于 `$DSH_HOME/dsh-progress-payment`。

## FAQ

### 1. 为什么本期金额和我自己算的不一样？

本包按**合同基准单价**计算本期金额，不用申报里填的单价。申报单价和基准不一致时会报 `E_PROGRESS_PRICE_MISMATCH`，并把“按申报单价算的金额”和“按合同单价算的金额”都列出来，差额在 `summary.price_adjustment_cents` 里。数量×单价按分四舍五入到整数分，不累加浮点误差。

### 2. “超合同量”到底按哪一版合同量？

给了合同基准就以基准为准；没给才用申报里的合同量。本期完成量超过合同量、累计完成量超过合同量都会报 `E_PROGRESS_OVER_QTY`，两者用 `kind` 区分（`period_over_contract` / `cumulative_over_contract`）。超量部分不会自动扣减合同额，需要走变更或结算。

### 3. 重复清单项会重复算钱吗？

不会。同一清单编码出现多次时，只按第一次出现的行计入本期金额，其余行在底稿里标 `是否计入=否`，并报 `E_PROGRESS_DUP_ITEM`。但哪一行才是“本期应报的”需要你确认，本包不自动挑。

### 4. 会改我的 CSV 或上传数据吗？

不会。只读用户指定的 CSV；只在本地 `exports/` 写底稿；不联网、不调用模型、不上传。

### 5. 能直接读 Excel 吗？

不能。请先在 Excel“另存为 → CSV UTF-8”。如果表头是中文且用 Excel 保存，文件可能带 BOM，本包能正确识别。

## 版本

`0.1.0-alpha.1` · 32 项测试通过（`node --test test/*.test.mjs`）。

> ⭐ 如果它帮到了你，点个 star 会让下一个人更容易找到它；没有任何功能被 star 解锁。

## 安装

```sh
dsh plugin --profile <profile> add dsh-progress-payment
dsh --profile <profile> --dump-config | grep dsh-progress-payment
```

卸载：

```sh
dsh plugin --profile <profile> remove dsh-progress-payment
```

### 安装通道

- **npm（推荐）:** `dsh plugin --profile <profile> add dsh-progress-payment`
- **git 通道:** `dsh plugin --profile <profile> add github:PerryLink/dsh-progress-payment`
- **tarball:** `pnpm pack`，然后 `dsh plugin --profile <profile> add ./dsh-progress-payment-<version>.tgz`

## 工具

工具名是稳定 API；说明保留英文以匹配运行时输出。

| 工具 | 用途 | 风险 |
|---|---|---|
| `progress.ingest` | 导入本期申报 CSV 与可选合同基准 CSV，返回 `batch_id`；只写会话内存 | R0 |
| `progress.audit` | 审核：本期金额、累计比例、超合同量、单价不符、累计>合同量、重复清单项；返回问题清单，金额整数分 | R0 |
| `progress.export` | 重跑审核并写审核底稿 CSV（UTF-8 BOM），返回路径、行数、sha256 | R1 local write |

## 审核规则

1. **金额**：`本期金额 = 本期完成量 × 合同单价`，按整数分四舍五入；累计金额同理。
2. **累计比例**：`累计金额 ÷ 合同金额 × 100`，保留 2 位小数；合同金额为 0 时返回 0。
3. **超合同量**：`本期完成量 > 合同量` 或 `累计完成量 > 合同量` → `E_PROGRESS_OVER_QTY`。
4. **单价不符**：申报合同单价 ≠ 合同基准单价 → `E_PROGRESS_PRICE_MISMATCH`；可用 `price_tolerance_bps` 放宽容差（默认 0，精确比对）。
5. **累计 > 合同量**：同 3 的 `cumulative_over_contract`，累计比例会超过 100%。
6. **重复清单项**：同一 `清单编码` 出现多次 → `E_PROGRESS_DUP_ITEM`；仅第一次出现计入金额。
7. **合同基准缺失 / 合同量不符**：`E_PROGRESS_CONTRACT_MISSING` / `E_PROGRESS_CONTRACT_MISMATCH`。
8. **累计小于本期**：`E_PROGRESS_QTY_INCONSISTENT`，通常是上期累计填错。

## 快速开始

```sh
# 1) 导入申报（工具面）
#    progress.ingest({ declaration_csv, contract_csv })

# 2) 审核（工具面）
#    progress.audit({ batch_id })

# 3) 导出底稿（工具面）
#    progress.export({ batch_id, filename: "progress-audit-2026-10.csv" })
```

用样例直接跑：

```sh
node samples/quickstart/run.mjs --check
```

## 验收证据

公开/合成 fixture 在 `samples/quickstart/`；`ACCEPTANCE.csv` 记录检查，除 quickstart 行外均为 `counted=false`。

| req_id | metric | threshold | actual | pass | source | counted |
|---|---|---|---|---|---|---|
| PG-A02 | 本期金额（分） | 5076360 | 5076360 | true | public/synthetic | false |
| PG-A06 | 单价不符 | E_PROGRESS_PRICE_MISMATCH x1 | 1 | true | public/synthetic | false |
| PS1-QS01 | quickstart 金标 | 1/1 | 1 | true | synthetic/quickstart | true |

*这是 fixture 支撑的验收行，不是客户运行；没有编造输出。*

## 边界与已知限制

- **只做量价核对**：不判断变更签证、索赔、质量扣款、税率和支付比例是否合理；这些仍需合同条款和人工判断。
- **单价只有一个口径**：申报里的 `合同单价` 是本期计价依据；没有“本期单价/信息价”列。
- **不自动挑选重复行**：重复清单项会全部列出并只计第一行，哪行应报需要人工确认。
- **金额上限**：单行金额需落在 JavaScript 安全整数范围内；超出会报 `E_PROGRESS_CSV_ROW`。
- **只收 CSV**：不支持 xlsx、PDF、扫描件；Excel 请先另存为 CSV。
- 仅公开/合成样例；alpha/partial、not counted，不作 GA 或生产可用声明。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm typecheck
node --test test/*.test.mjs
node scripts/gate.mjs
```

## 兼容性

| 维度 | 状态 |
|---|---|
| Harness | `dsh >=0.2.1-rc.3 <0.4.0` |
| Node | `>=24.9.0 <25` |
| Platforms | All; local files only |
| 数据 | No network, no model call, no upload |

## 相关项目

- [dsh-ifc-qto](https://github.com/PerryLink/dsh-ifc-qto)（模型工程量，可作为申报量的对照）
- [dsh-ap-three-way](https://github.com/PerryLink/dsh-ap-three-way)（付款单三单匹配）
- [领域索引](https://perrylink.github.io/dsh-plugins/)

## 许可证

Apache-2.0. See `LICENSE`, `NOTICE`, `THIRD-PARTY-NOTICES`.

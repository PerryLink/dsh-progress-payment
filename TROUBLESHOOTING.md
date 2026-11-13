# 故障排查 — dsh-progress-payment

每条按「症状 / 原因 / 动作」写。报错原文都是 `<一句人话>（E_XXX）｜下一步：<动作>`，
把 `E_XXX` 和这句话一起发到 issue 即可定位。不要把真实申报或合同金额贴进 issue。

## 1. CSV 缺列或某行读不懂（E_PROGRESS_CSV_ROW）

- **症状**：`申报或合同 CSV 的表头/某一行读不懂（E_PROGRESS_CSV_ROW）｜下一步：按 README 的列名补齐表头；数量写纯数字（最多 3 位小数），单价写金额（最多 2 位小数），不要带单位｜细节：申报 CSV 缺少列：cumulative_qty；表头是：…`
- **原因**：表头少了 7 列中的某一列；或某一行数量/单价为空、带单位、负数、超过小数位；或合同基准里同一清单编码出现两次。
- **动作**：对照 `samples/quickstart/input/` 的表头；数量写 `25.92`，单价写 `480.00`，不要写 `25.92m3` 或 `￥480`。合同基准一条清单只能一行。Excel 请另存为 CSV UTF-8。

## 2. 空 CSV（E_PROGRESS_CSV_EMPTY）

- **症状**：`这个 CSV 是空的，既没有表头也没有数据（E_PROGRESS_CSV_EMPTY）｜下一步：确认文件不是 0 字节，并且第一行是表头、后面至少有一行数据`
- **原因**：文件 0 字节、只有空行，或导出时选错了工作表。
- **动作**：确认文件大小 > 0，第一行是表头；重新从 Excel 导出。

## 3. 超合同量（E_PROGRESS_OVER_QTY）

- **症状**：`累计完成量 101.5 超过合同量 95（E_PROGRESS_OVER_QTY）｜下一步：核对合同量和变更签证；超量部分走变更或结算，不在本期支付`
- **原因**：申报的本期或累计完成量大于合同基准数量；常见于变更未入合同、上期累计填错、或单位换算错误（m³ / m² / t）。
- **动作**：以合同基准为准核对；确属变更的，先办变更或签证再报量；单位不一致先统一单位。超量部分不会自动从本期金额扣减，需要人工签认。

## 4. 单价与合同不符（E_PROGRESS_PRICE_MISMATCH）

- **症状**：`申报合同单价 65.00 与合同基准 55.00 不符（E_PROGRESS_PRICE_MISMATCH）｜下一步：本期金额按合同单价 55.00 重算，并要求申报方改正`
- **原因**：申报表里的合同单价被改动，或合同基准版本过期。
- **动作**：本期金额已按合同单价重算；让申报方改正单价，或确认哪一版合同才是现行版本。`price_tolerance_bps` 只用于允许的报价浮动，不要用它掩盖错价。

## 5. 重复清单项（E_PROGRESS_DUP_ITEM）

- **症状**：`清单编码 010101003 在本期申报里出现 2 次（行 2、7）（E_PROGRESS_DUP_ITEM）｜下一步：确认哪一行是本期应报的；重复行不计入本期金额`
- **原因**：申报表复制粘贴重复、多个标段合并时编码冲突，或同一清单拆成两行报量。
- **动作**：确认哪一行是本期应报；底稿里重复行已标 `是否计入=否`，不会重复计钱。不要直接删原始申报文件。

## 6. 合同基准缺清单 / 合同量不符（E_PROGRESS_CONTRACT_MISSING / E_PROGRESS_CONTRACT_MISMATCH）

- **症状**：`清单编码 Z-9 不在合同基准里（E_PROGRESS_CONTRACT_MISSING）｜下一步：先补合同基准；补不了就单独确认这条清单的合同量和单价，不要直接计入本期`；或 `申报合同量 120 与合同基准 100 不符（E_PROGRESS_CONTRACT_MISMATCH）｜下一步：以合同基准为准改正申报；确需调整先办合同变更`
- **原因**：新增清单没有进合同基准，或申报表里的合同量/单价与基准版本不一致。
- **动作**：补齐或更新合同基准；`CONTRACT_MISSING` 时本包会回退用申报值计算并标问题，不能当作已核验。

## 7. 累计小于本期（E_PROGRESS_QTY_INCONSISTENT）

- **症状**：`累计完成量 10 小于本期完成量 20（E_PROGRESS_QTY_INCONSISTENT）｜下一步：核对上期累计数；累计完成量应当大于或等于本期完成量`
- **原因**：上期累计结转错误，或本期完成量填成了合同量。
- **动作**：核对上期已批累计；累计应 ≥ 本期。改完重新导入，不要手改已导出的底稿。

## 8. 找不到这批申报（E_PROGRESS_BATCH_NOT_FOUND）

- **症状**：`找不到这批申报（E_PROGRESS_BATCH_NOT_FOUND）｜下一步：先运行 progress_ingest 导入 CSV 拿到 batch_id，再运行 progress_audit 或 progress_export`
- **原因**：`batch_id` 拼错，或换了会话/进程（批次只存在当前会话内存里）。
- **动作**：重新运行 `progress_ingest` 拿到新的 `batch_id`，再做 `audit` / `export`。

## 9. 审核参数不合法（E_PROGRESS_OPTION_INVALID）

- **症状**：`审核参数不合法（E_PROGRESS_OPTION_INVALID）｜下一步：price_tolerance_bps 传 0 或正整数（单位：万分之一），不传表示 0`
- **原因**：`price_tolerance_bps` 传了负数、NaN 或小数。
- **动作**：不传（默认 0，精确比对）或传 `100`、`2000` 这样的非负整数。

## 10. 导出文件名不安全 / 写不出去（E_PROGRESS_PATH_INVALID / E_PROGRESS_PATH_NOT_ALLOWED / E_PROGRESS_EXPORT_FAILED）

- **症状**：`导出文件名不安全（E_PROGRESS_PATH_INVALID）｜下一步：只传一个由字母、数字、点、下划线或短横线组成的文件名`；或 `审核底稿没有写出去（E_PROGRESS_EXPORT_FAILED）`
- **原因**：`filename` 带 `../`、`/`、反斜杠、空格、中文或超长；或 `$DSH_HOME/dsh-progress-payment` 只读 / 磁盘满。
- **动作**：只传 `progress-audit-2026-10.csv` 这样的单文件名；确认 `$DSH_HOME` 可写（测试时设 `DSH_PROGRESS_PAYMENT_HOME` 到临时目录），不要删除用户数据来“修复”。

## 还不行

```sh
node samples/quickstart/run.mjs --check   # 自带样例必须通过
node --test test/*.test.mjs               # 32 项测试
node scripts/gate.mjs                     # 元数据 + 验收门
```

仍失败时请在 <https://github.com/PerryLink/dsh-progress-payment/issues> 附上：包版本、最小合成申报
（或生成脚本）、`progress_audit` 的完整报错行、Node 与 DSH 版本。**不要附真实合同或客户申报。**

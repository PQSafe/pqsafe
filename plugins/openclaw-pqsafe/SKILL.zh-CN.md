---
name: pqsafe-pay
version: 0.1.0
description: Post-quantum signed payment mandates for OpenClaw agents
author: PQSafe Inc
license: Apache-2.0
homepage: https://pqsafe.xyz/openclaw-skill
repository: https://github.com/pqsafe-inc/openclaw-pqsafe
clawhub: https://clawhub.ai/skills/pqsafe-pay
tags:
  - payments
  - security
  - post-quantum
  - ml-dsa
  - compliance
runtime: node>=18
---

# @pqsafe/openclaw — 后量子 AI 代理支付安全层

## 概述

`@pqsafe/openclaw` 是 OpenClaw 生态的支付授权中间件。当 AI 代理发起支付工具调用时，本技能通过 `before_tool_call` 钩子拦截请求，在资金实际转移前验证密码学签名授权凭证（SpendEnvelope），确保每笔交易均在预设边界内执行。

签名算法采用 **ML-DSA-65**（NIST FIPS 204），属于国家标准机构认证的首批抗量子签名方案之一。签名体积 3,309 字节，验证耗时 < 5 ms。

许可证：**Apache-2.0**（企业可自由集成，无 GPL 传染性）

---

## 安全背景

2026 年 4 月，OpenClaw 生态的 ClawHavoc 供应链攻击被公开披露：研究人员在超过 1,400 个恶意技能中发现 138 个 CVE，部分恶意技能可无声将支付工具调用重定向至攻击者账户。

同期，FIDO 联盟代理认证技术工作组（AP TWG）于 2026 年 4 月 28 日发布 **AP2-PQ profile**，确立了自主代理场景下后量子、硬件绑定授权验证的标准化模式。

`@pqsafe/openclaw` 实现了上述授权层，将支付执行与授权凭证解耦，防止以下攻击向量：

- 幻觉收款人：LLM 生成看似合法但未被授权的收款账户
- 提示注入篡改金额：恶意文档注入文本，使代理传递超额金额
- 重放攻击：捕获有效签名凭证并在不同会话中重放
- 依赖包投毒：恶意包升级在验证层前篡改支付参数
- 权限泄漏：通用技能通过配置错误获得支付工具访问权

---

## 技能暴露的操作

### 1. `verify_mandate`
在支付执行前验证 SpendEnvelope 签名。

**输入参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `envelope` | `string` | Base64 编码的 SpendEnvelope（已签名） |
| `payment_params` | `object` | 当前支付调用的参数（金额、收款人、货币） |
| `nonce` | `string` | 防重放随机数（UUID v4） |

**返回值：**
- `{ ok: true, audit_id: string }` — 验证通过，审计日志已写入
- `{ ok: false, reason: string }` — 验证失败，附拒绝原因

---

### 2. `issue_mandate`
为指定支付场景签发新的 SpendEnvelope。需要签发方持有 ML-DSA-65 私钥。

**输入参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `payee_allowlist` | `string[]` | 允许的收款账户列表 |
| `amount_cap` | `number` | 单笔最大金额（以最小货币单位计） |
| `currency` | `string` | ISO 4217 货币代码（如 `HKD`、`USD`） |
| `expires_at` | `string` | ISO 8601 到期时间 |
| `issuer_key_id` | `string` | 签发方密钥标识符 |

**返回值：**
- `{ envelope: string, fingerprint: string }` — Base64 编码的 SpendEnvelope + 指纹

---

### 3. `revoke_mandate`
立即吊销指定指纹的 SpendEnvelope，使其在后续 `verify_mandate` 调用中失效。

**输入参数：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `fingerprint` | `string` | 目标 SpendEnvelope 指纹 |
| `reason` | `string` | 吊销原因（写入审计日志） |

---

## SpendEnvelope 结构

```typescript
interface SpendEnvelope {
  version: 1;
  issuer: string;          // 签发方 DID 或密钥 ID
  payee_allowlist: string[]; // 允许的收款账户列表
  amount_cap: number;      // 单笔最大金额（最小货币单位）
  currency: string;        // ISO 4217
  period_cap?: number;     // 周期累计上限（可选）
  period?: "day" | "week" | "month"; // 周期定义（可选）
  expires_at: string;      // ISO 8601 到期时间
  nonce: string;           // 防重放随机数
  issued_at: string;       // 签发时间
  // ML-DSA-65 签名（覆盖上述所有字段，3,309 字节，Base64 编码）
  signature: string;
}
```

---

## 快速开始

### 安装

```bash
npm install @pqsafe/openclaw
```

### TypeScript 示例

```typescript
import { PQSafeOpenClaw } from "@pqsafe/openclaw";

// 初始化：传入签发方公钥（用于验证）
const pqsafe = new PQSafeOpenClaw({
  issuerPublicKey: process.env.PQSAFE_PUBLIC_KEY!, // ML-DSA-65 公钥（Base64）
  auditRetentionDays: 2555,  // 7 年审计保留期（对应企业内控要求）
});

// 在 OpenClaw 运行时注册 before_tool_call 钩子
runtime.use(
  pqsafe.beforeToolCall({
    // 仅对支付相关工具启用验证
    toolFilter: (toolName) => toolName.startsWith("payment."),
    // 验证失败时的处理策略：block（阻断）| log（仅记录）
    onFailure: "block",
  })
);

// 验证失败时会收到结构化拒绝响应：
// { ok: false, reason: "amount_cap_exceeded", audit_id: "aud_..." }
```

---

## 支持的支付通道

| 通道 | 状态 | 说明 |
|------|------|------|
| Airwallex | 生产就绪 | 跨境汇款、多货币账户 |
| Wise | 生产就绪 | 个人及企业国际转账 |
| Stripe | 模拟就绪 | 信用卡收单、订阅 |
| USDC (Base) | 模拟就绪 | 链上稳定币转账 |
| x402 | 模拟就绪 | HTTP 原生微支付协议 |
| 微信支付 | 规划中 | 国内商业场景 |
| 支付宝 | 规划中 | 国内商业场景 |

---

## 安全模型

```
┌─────────────────────────────────────────────────────────┐
│                   OpenClaw 运行时                        │
│                                                         │
│  用户提示 ──► LLM ──► tool_call({ payment-send })       │
│                                  │                      │
│                        before_tool_call 钩子             │
│                                  │                      │
│                    ┌─────────────▼─────────────┐        │
│                    │   SpendEnvelope 验证器      │        │
│                    │  1. ML-DSA-65 签名有效？    │        │
│                    │  2. 凭证未过期？            │        │
│                    │  3. 收款人在白名单？        │        │
│                    │  4. 金额 ≤ 上限？           │        │
│                    │  5. 随机数未被重放？        │        │
│                    └──────┬──────────┬──────────┘        │
│                          通过        拒绝                │
│                            │            │                │
│                      支付通道       阻断 + 审计日志       │
└─────────────────────────────────────────────────────────┘
```

---

## ML-DSA-65 参数

| 参数 | 值 |
|------|----|
| 标准 | NIST FIPS 204 |
| 安全级别 | NIST 3 级（等效 AES-192） |
| 公钥大小 | 1,952 字节 |
| 私钥大小 | 4,032 字节 |
| 签名大小 | **3,309 字节** |
| 验证耗时 | < 5 ms（Node.js 18+，Apple M 系列） |
| 量子安全 | 是（格密码学，抵抗 Shor 算法） |

---

## 获取技能

**npm：**
```bash
npm install @pqsafe/openclaw
```

**ClawHub 技能市场：**
[clawhub.ai/skills/pqsafe-pay](https://clawhub.ai/skills/pqsafe-pay)

**GitHub 仓库：**
[github.com/pqsafe-inc/openclaw-pqsafe](https://github.com/pqsafe-inc/openclaw-pqsafe)

**API 文档：**
[pqsafe.xyz/openclaw-skill](https://pqsafe.xyz/openclaw-skill)

---

## 参考资料

- NIST FIPS 204 — Module-Lattice-Based Digital Signature Standard
- NIST IR 8547 — Transition to Post-Quantum Cryptography Standards（初始公开草案）
- FIDO Alliance AP2-PQ Profile — Agentic Authentication TWG，2026 年 4 月 28 日
- PSD2 强认证（SCA）指令 — 欧洲银行管理局
- ClawHavoc 研究报告 — 1,400+ 恶意技能，138 个 CVE，2026 年 4 月
- Sumsub 代理交易监控白皮书

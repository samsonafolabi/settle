# Settle

**Intent-based yield on Somnia.**

Settle lets you describe what you want to do with your money in plain English. The agent handles the rest — parsing your intent, verifying the action, submitting to the vault, and logging a permanent onchain receipt.

Every action is validated by Accord, Somnia's onchain deterministic LLM, and attested through a trust pipeline before a single token moves.

---

## How It Works

```
User types intent
      ↓
Sage parses intent → resolves policy → builds action
      ↓
Sentry verifies action is safe and matches intent
      ↓
User approves wallet transaction
      ↓
SettleVault submits to Accord (Somnia onchain LLM)
      ↓
Accord validates against live pool data
      ↓
Vault finalises deposit
      ↓
AttestationStore logs permanent receipt
      ↓
UI displays receipt and public proof
```

---

## The Trust Pipeline

Most AI finance products parse intent and execute. Settle adds verification layers at every stage.

| Layer | Role | Where |
|---|---|---|
| **Sage** | Parses natural language → resolves policy → builds action | Offchain |
| **Policy Resolver** | Maps intent into deterministic policy boundaries | Offchain |
| **Sentry** | Verifies action is safe and consistent with intent | Offchain API |
| **Accord** | Validates final pool against live onchain APY data | Onchain LLM |
| **QuillProof** | Cryptographic attestation of the full intent-to-execution story | Offchain SDK |
| **AttestationStore** | Permanent onchain receipt ledger | Onchain |

---

## Policy System

Not all user requests are equal. Settle maps intent into explicit policy categories before execution.

| User Says | Policy | Expected Pool |
|---|---|---|
| "Deposit 10 USDC into SETTLE_POOL_B" | `EXACT_POOL` | SETTLE_POOL_B |
| "deposit into the safest pool" | `SAFEST` | SETTLE_POOL_A (lowest risk) |
| "deposit into a balanced pool" | `BALANCED` | SETTLE_POOL_B (best APY, non-HIGH risk) |
| "deposit into the highest yield pool" | `HIGHEST_YIELD` | SETTLE_POOL_C |

This distinction matters. "Deposit into SETTLE_POOL_B" is an explicit instruction — the system must not override it for a higher APY pool. "Deposit into the highest yield pool" is a strategy — the system selects accordingly.

> In agentic finance, user intent must be converted into policy before execution.

---

## Accord Integration

Settle uses Somnia's onchain LLM agent (`0x037Bb9...`) via the real async callback architecture:

```
deposit() → createRequest{value: STT}() → Accord consensus
                                                ↓
handleResponse() ← platform callback ← nodes agree
```

Two Accord calls per deposit:

1. **Safety check** — `inferString` → `EXECUTE` or `BLOCKED`
2. **Pool validation** — `inferNumber` → confirmed pool index

Accord receives constrained prompts based on resolved policy. For exact pool requests, Accord is instructed not to optimize for APY. For strategy requests, Accord selects within the policy boundary.

> Onchain AI validation should validate policy, not invent policy.

---

## Contracts

**Somnia Shannon Testnet**
RPC: `https://dream-rpc.somnia.network`
Explorer: `https://shannon-explorer.somnia.network`

| Contract | Address | Status |
|---|---|---|
| SettleVault | `0xe9DdC74458969D8E1031dAF9672ACcEc3E545767` | Verified |
| AttestationStore | `0x325C3698e6a22A04126b2b8eB5fDC457b4053f3E` | Verified |
| APYFeed | `0x706AC415F1e60485318890ec7c5eBa2D894fDB5b` | Verified |
| MockUSDC | `0xD91a4eF9cf04b8dD4aBe40Da6CDbFc8F28b95D95` | Verified |
| Accord Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` | External |

---

## Yield Pools

| Pool | Risk | APY |
|---|---|---|
| SETTLE_POOL_A | LOW | 5.20% |
| SETTLE_POOL_B | MED | 8.71% |
| SETTLE_POOL_C | HIGH | 12.40% |

---

## Stack

```
settle/
├── settle-contracts/   Foundry — Solidity contracts
├── settle-quill/       TypeScript — attestation pipeline (QuillProof)
├── settle-sage/        TypeScript — intent parser + policy resolver
├── settle-sentry/      Next.js — safety verification API
└── settle-app/         Next.js — frontend
```

---

## Supported Demo Prompts

```
Deposit 10 USDC into SETTLE_POOL_B
deposit 10 USDC into the safest pool
deposit 10 USDC into a balanced pool
deposit 10 USDC into the highest yield pool
```

---

## Public Receipt Browser

No wallet needed. View real onchain deposit history at `/proof`.

The receipt browser reads directly from `AttestationStore` and shows:

- What the user asked
- Which pool was finalised
- Amount deposited
- Risk tier and APY at deposit time
- Timestamp
- Policy status

The receipt timeline includes pre-policy receipts from the build process — showing how the system evolved from loose agent behavior to deterministic policy enforcement.

---

## Running Locally

**Prerequisites:** Node.js 18+, npm

```bash
# Clone
git clone https://github.com/samsonafolabi/settle
cd settle

# Install all packages
npm install

# Start Sentry (verification API)
cd settle-sentry
cp .env.example .env  # add GROQ_API_KEY
npm run dev

# Start frontend
cd settle-app
cp .env.example .env  # add contract addresses + RPC
npm run dev
```

**Environment variables — settle-app:**
```env
NEXT_PUBLIC_SOMNIA_RPC_URL=https://dream-rpc.somnia.network
NEXT_PUBLIC_VAULT_ADDRESS=0xe9DdC74458969D8E1031dAF9672ACcEc3E545767
NEXT_PUBLIC_ATTESTATION_STORE_ADDRESS=0x325C3698e6a22A04126b2b8eB5fDC457b4053f3E
NEXT_PUBLIC_APY_FEED_ADDRESS=0x706AC415F1e60485318890ec7c5eBa2D894fDB5b
NEXT_PUBLIC_USDC_ADDRESS=0xD91a4eF9cf04b8dD4aBe40Da6CDbFc8F28b95D95
SENTRY_URL=http://localhost:3001
GROQ_API_KEY=your_key
```

---

## Key Learnings

**LLMs can override user intent.** Raw LLM or Accord behavior without constraints will optimize for "better" outcomes that violate explicit instructions. The policy resolver and constrained prompts solve this.

**Callback-based systems fail silently.** The Accord async pattern requires exact enum alignment between your contract and the platform. An off-by-one in response status silently breaks the entire deposit flow.

**The deployed contract is the source of truth.** Not the TypeScript file, not the ABI copy, not the old test. Verify behavior with `cast call` before wiring anything.

**Receipts are the product.** For financial agents, auditability is not a feature — it is the trust model.

---

## What's Next

- Vault-level policy enforcement — vault independently rejects a final pool that violates resolved policy
- Manual rebalance — user-triggered position moves
- LLM reasoning in receipts — `chainOfThought: true` logged permanently
- Reactive trigger — autonomous rebalancing when APY drops below threshold
- Quill SDK — publish attestation pipeline as open-source NPM package

---

## Built For

Somnia Hackathon 2026

> The world is shifting from person-to-person transfers to agent-to-agent commerce. The key question on everyone's mind will be: is my money safe? What is this agent going to do with my money? Settle is the answer.

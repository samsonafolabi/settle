# Settle

**The trust layer for agentic finance on Somnia.**

Most AI finance tools parse your intent and execute. Settle adds what's missing: **verification, policy enforcement, and a permanent onchain receipt at every step.**

Type what you want. Settle's pipeline compiles it into a verified, attested, auditable vault deposit — with a record that proves exactly what happened and why.

---

## The Problem With "Intent → Execute"

When an AI agent handles your money, two questions matter:

1. Did it do what I actually asked?
2. Can I prove it?

Neither is answered by execution alone. Settle answers both.

---

## How Settle Works

```
"deposit 10 USDC into the safest pool"
          ↓
    Sage resolves policy
    (SAFEST → SETTLE_POOL_A)
          ↓
    Sentry verifies action matches intent
    (EXECUTE / WARNING / BLOCKED)
          ↓
    User signs wallet transaction
          ↓
    SettleVault submits to Accord
    (onchain AI validation, Somnia-native)
          ↓
    Accord validates pool against live APY data
          ↓
    Vault finalises deposit
          ↓
    AttestationStore logs permanent receipt
          ↓
    UI shows receipt with full pipeline trace
```

Every step is inspectable. Nothing is hidden.

---

## The Trust Pipeline

| Layer | What It Does | Where |
|---|---|---|
| **Sage** | Parses intent, resolves policy, builds action | Offchain |
| **Sentry** | Verifies action is safe and consistent with intent | Offchain API |
| **Accord** | Validates final pool against live onchain APY data | Onchain (Somnia-native) |
| **AttestationStore** | Permanent receipt ledger — one entry per deposit | Onchain |
| **QuillProof** | Signs and structures the intent-to-execution audit trail | Offchain → Onchain |

---

## Policy System

Intent is ambiguous. Policy is not. Sage converts one into the other before anything touches the chain.

| User Says | Policy | Resolved Pool |
|---|---|---|
| `"deposit into SETTLE_POOL_B"` | `EXACT_POOL` | SETTLE_POOL_B — no override |
| `"deposit into the safest pool"` | `SAFEST` | SETTLE_POOL_A (lowest risk) |
| `"deposit into a balanced pool"` | `BALANCED` | SETTLE_POOL_B (best APY, non-HIGH risk) |
| `"deposit into the highest yield pool"` | `HIGHEST_YIELD` | SETTLE_POOL_C |

`"Deposit into SETTLE_POOL_B"` is an instruction — the system must not override it for a higher APY pool. `"Highest yield"` is a strategy — the system selects accordingly.

**Without a policy layer, LLMs optimize for outcomes that violate explicit user instructions.** Settle enforces the distinction.

---

## Accord Integration

Settle uses Somnia's native Accord onchain validation layer via the real async callback architecture — not a mock, not a simulation.

```
deposit() → createRequest{value: STT}() → Accord consensus
                                                ↓
handleResponse() ← platform callback ← nodes agree
```

Two Accord calls per deposit:

- **Safety check** — `inferString` → `EXECUTE` or `BLOCKED`
- **Pool validation** — `inferNumber` → confirmed pool index

Accord receives constrained prompts based on resolved policy. For exact pool requests, Accord is instructed not to optimize for APY. For strategy requests, Accord selects within the policy boundary.

> Onchain AI validation should validate policy — not invent it.

---

## Receipts Are the Product

Every deposit produces an onchain receipt visible in the UI and queryable from `AttestationStore.getDeposits(wallet)` — no wallet needed to browse.

Each receipt shows:
- What you asked (verbatim intent)
- Which pool was finalised and why
- Amount, APY, and risk tier at deposit time
- Full pipeline trace: Sage → Sentry → Accord → Vault
- Policy status — including mismatches flagged as warnings

**In agentic finance, auditability is not a feature. It is the trust model.**

---

## Contracts — Somnia Shannon Testnet

| Contract | Address |
|---|---|
| SettleVault | `0xe9DdC74458969D8E1031dAF9672ACcEc3E545767` |
| AttestationStore | `0x325C3698e6a22A04126b2b8eB5fDC457b4053f3E` |
| APYFeed | `0x706AC415F1e60485318890ec7c5eBa2D894fDB5b` |
| MockUSDC | `0xD91a4eF9cf04b8dD4aBe40Da6CDbFc8F28b95D95` |
| Accord Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |

**Yield Pools**

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

## Running Locally

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/samsonafolabi/settle
cd settle && npm install

# Sentry (verification API)
cd settle-sentry
cp .env.example .env   # add GROQ_API_KEY
npm run dev

# Frontend
cd settle-app
cp .env.example .env   # add contract addresses + RPC
npm run dev
```

**`settle-app` environment variables:**

```env
NEXT_PUBLIC_SOMNIA_RPC_URL=https://dream-rpc.somnia.network
NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS=0xe9DdC74458969D8E1031dAF9672ACcEc3E545767
NEXT_PUBLIC_ATTESTATION_STORE_ADDRESS=0x325C3698e6a22A04126b2b8eB5fDC457b4053f3E
NEXT_PUBLIC_APY_FEED_ADDRESS=0x706AC415F1e60485318890ec7c5eBa2D894fDB5b
NEXT_PUBLIC_USDC_ADDRESS=0xD91a4eF9cf04b8dD4aBe40Da6CDbFc8F28b95D95
GROQ_API_KEY=your_key
```

---

## Try It

```
deposit 10 USDC into the safest pool
deposit 10 USDC into the highest yield pool
deposit 10 USDC into a balanced pool
deposit 10 USDC into SETTLE_POOL_B
```

**No wallet needed to browse receipts** — visit `/proof` to see live onchain deposit history directly from AttestationStore.

---

## Known Limitations

**No timeout refund.** If Accord never callbacks after a deposit, USDC remains in escrow. A user-triggered timeout refund is planned post-hackathon.

**QuillProof is an audit trail, not a vault gatekeeper.** The signature is not verified onchain — full cryptographic binding is post-hackathon scope.

**MockUSDC only.** Real USDC integration is post-hackathon.

---

## Key Learnings

**LLMs override user intent without constraints.** The policy resolver exists because raw LLM and Accord behavior will optimize for "better" outcomes that violate explicit instructions. Constrained prompts fix this.

**Callback-based systems fail silently.** The Accord async pattern requires exact enum alignment between your contract and the platform. An off-by-one in response status silently breaks the entire deposit flow.

**The deployed contract is the source of truth.** Not the TypeScript file. Verify with `cast call` before wiring anything.

**Receipts are the product.** Execution without auditability is just trust. Settle makes that trust verifiable.

---

## What's Next

- Vault-level policy enforcement — vault independently rejects pools that violate resolved policy
- Timeout refund — user-triggered USDC recovery if Accord never finalises
- Agent reasoning summaries in receipts
- Reactive trigger — autonomous rebalancing when APY drops below threshold
- Quill SDK — attestation pipeline as open-source NPM package
- Real USDC

---

## Built For

**Somnia Hackathon 2026**

The world is moving toward agent-mediated commerce. The question users will ask is simple:

*"Is my money safe, and what exactly is this agent doing with it?"*

Settle is built to answer that question — with policy, validation, and receipts.

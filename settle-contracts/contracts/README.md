# Settle Contracts

Smart contracts for Settle, an intent-based savings agent on Somnia.

Settle converts plain-English deposit intents into verified onchain vault actions. The contracts handle pool data, token deposits, Accord validation callbacks, user positions, and permanent receipt logging.

## Contracts

### SettleVault

Core vault contract.

Responsibilities:

- Accepts USDC deposits.
- Requests Accord validation for safety and pool confirmation.
- Finalises deposits into the confirmed pool.
- Tracks user positions.
- Supports withdrawal.
- Supports reactive rebalancing through an approved trigger.
- Writes completed deposit/rebalance receipts to `AttestationStore`.

Verified contract:

```
0xe9DdC74458969D8E1031dAF9672ACcEc3E545767
```

---

### AttestationStore

Permanent receipt ledger for Settle actions.

Responsibilities:

- Stores completed deposit receipts.
- Stores rebalance receipts.
- Exposes public read functions for receipt browsing.
- Provides the data used by Settle's public receipt browser.

Verified contract:

```
0x325C3698e6a22A04126b2b8eB5fDC457b4053f3E
```

---

### APYFeed

Pool registry and APY source used by Sage, Sentry, Accord prompts, and the Vault.

Responsibilities:

- Stores available yield pools.
- Tracks APY, risk, active status, and last update time.
- Exposes pool data for onchain validation and frontend reads.

Verified contract:

```
0x706AC415F1e60485318890ec7c5eBa2D894fDB5b
```

---

### MockUSDC

Test USDC token used for Somnia Shannon testnet deposits.

Verified contract:

```
0xD91a4eF9cf04b8dD4aBe40Da6CDbFc8F28b95D95
```

---

## Network

**Somnia Shannon Testnet**

```
RPC:      https://dream-rpc.somnia.network
Explorer: https://shannon-explorer.somnia.network
```

---

## Install

Install Foundry dependencies:

```bash
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
```

## Build

```bash
forge build
```

## Test

```bash
forge test
```

## Deploy

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Then fill in the required values.

Example deploy command:

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

---

## Security Notes

This is a hackathon/testnet deployment. Current version demonstrates:

- Intent-based deposits
- Accord validation
- Verified vault execution
- Public onchain receipts
- APY pool selection
- Receipt browsing

Production hardening would include:

- Contract-level policy enforcement
- Audited protocol adapters
- Stronger withdrawal/rebalance controls
- Event indexing for complete transaction proof
- A formal audit before mainnet funds

---

## License

MIT

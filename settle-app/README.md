# Settle App

Frontend for Settle, an intent-based savings agent on Somnia.

The app lets users describe a deposit intent in plain English, routes it through Sage and Sentry, submits the transaction to the Settle Vault, and displays public onchain receipts from AttestationStore.

---

## Routes

| Route              | Description                       |
| ------------------ | --------------------------------- |
| `/`                | Settle dashboard and deposit flow |
| `/receipts`        | Receipt history                   |
| `/proof`           | Public onchain receipt browser    |
| `/receipts/public` | Public receipt browser alias      |

---

## Environment

Copy `.env.example` to `.env.local` and fill in the required values:

```bash
cp .env.example .env.local
```

---

## Development

```bash
pnpm install
pnpm dev
```

---

## Network

**Somnia Shannon Testnet**

```
RPC:      https://dream-rpc.somnia.network
Explorer: https://shannon-explorer.somnia.network
```

---

## Verified Contracts

| Contract         | Address                                      |
| ---------------- | -------------------------------------------- |
| SettleVault      | `0xe9DdC74458969D8E1031dAF9672ACcEc3E545767` |
| AttestationStore | `0x325C3698e6a22A04126b2b8eB5fDC457b4053f3E` |
| APYFeed          | `0x706AC415F1e60485318890ec7c5eBa2D894fDB5b` |
| MockUSDC         | `0xD91a4eF9cf04b8dD4aBe40Da6CDbFc8F28b95D95` |

---

## License

MIT

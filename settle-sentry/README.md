cat > settle-sentry/README.md <<'EOF'

# Settle Sentry

Settle Sentry is the verification layer for Settle.

It receives a structured intent and transaction plan, checks whether the action matches the user's request, and returns a safety verdict used by the frontend before wallet execution.

## Verdicts

- `EXECUTE` — transaction matches the user's intent and can proceed.
- `WARNING` — transaction is potentially valid but has a mismatch or elevated risk.
- `BLOCKED` — transaction should not proceed.

## Role in Settle

Sentry sits between Sage and the wallet transaction flow:

```txt
User intent
→ Sage parses intent
→ Sentry verifies action
→ Wallet signs transaction
→ Vault submits to Accord
→ Receipt is recorded
```

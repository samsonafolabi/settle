# Settle

Autonomous yield rebalancing vault on Somnia —
powered by QuillProof cryptographic attestation.

## Stack

- **settle-sage** — natural language intent parser
- **settle-quill** — attestation pipeline (QuillProof)
- **settle-sentry** — transaction verification agent
- **settle-contracts** — Solidity vault, APYFeed,
  AttestationStore, ReactiveT rigger
- **settle-app** — Next.js frontend

## Architecture

User intent
↓
Sage — parses intent, builds calldata
↓
Quill — captures, verifies, attests
↓
Sentry — verifies intent matches calldata
↓
QuillProof — cryptographic receipt
↓
Vault — executes on Somnia
↓
AttestationStore — permanent proof log

## Deployed on Somnia Testnet

APYFeed: 0x4Ce7527f538238Cd049eB561c5De04EE84428833
AttestationStore: 0xa8a1CfE2662DdB5222A2E7f0b4c0ED7bAa313df0
SettleVault: 0x9AEFcB5939c20Ff6c7c118C2485012A240411CE1
ReactiveTrigger: 0xCDbaEEdc467CC13B3a28D9E5026D466415C474DA

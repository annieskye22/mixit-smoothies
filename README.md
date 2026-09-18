# Mixit Smoothies

A NEAR beverage traceability scaffold: producers register batches, distributors receive and transfer them, retailers hold the final custody record, and consumers verify the trail without connecting a wallet.

## Structure

```text
mixit-smoothies/
├── contract/                 Rust NEAR contract and unit tests
│   ├── Cargo.toml            near-sdk pinned to 5.29.1
│   └── src/{lib,tests}.rs
├── backend/                  Express 5 + TypeScript + near-api-js
│   ├── src/                  Validation, RPC adapter, routes, server
│   ├── test/                 API behavior tests with mocked RPC
│   └── .env.example
├── frontend/                 React + Vite + TypeScript + Tailwind 4
│   ├── src/components/ui/    Editable shadcn/ui-style component source
│   ├── src/components/       QR camera scanner
│   ├── src/lib/              API client and NEAR Wallet Selector
│   ├── src/App.tsx           Consumer verification + partner dashboard
│   └── components.json       shadcn CLI configuration
├── docs/                     Architecture, API, deployment, evaluation
└── .github/workflows/        JavaScript checks and Rust tests/WASM build
```

## Local setup

Requires Node.js 22.22.2+ and npm (the near-api-js engine requirement). Contract development additionally requires Rust stable, a native compiler/linker, the WASM target, and cargo-near. On Windows, WSL2 is recommended for NEAR sandbox integration testing.

From this directory, in PowerShell:

```powershell
npm install
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
# Edit backend/.env: set your real deployed NEAR_CONTRACT_ID.
npm run dev
```

The frontend runs at http://localhost:5173 and proxies `/api` to http://localhost:3001. The API intentionally requires a configured contract. The scaffold does not deploy accounts or fabricate blockchain data. Deploy and initialize the contract using [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), then onboard partner accounts.

Vite and frontend tests use the supported `runner` config loader to avoid config-bundler ancestor-directory access problems in restricted Windows environments.

```powershell
npm run typecheck
npm test
npm run build
npm run test:contract
npm run build:contract
```

## Included behavior

- Owner-controlled participant roles; everyone else is a Consumer/Verifier.
- Unique IDs of the form `producer.testnet:<local UUID>`; the contract rejects duplicates and derives the producer prefix from the real caller.
- Strict Producer → Distributor → Retailer transitions; only the current custodian can transfer.
- Append-only, paginated custody events with actor, timestamp, recipient role, and status.
- Custom `mixit_trace` events in the NEP-297 envelope, with storage charged to the caller and unused deposit refunded.
- API preparation of unsigned registration and transfer transactions; users sign through NEAR Wallet Selector / MyNearWallet. No wallet private keys go to the backend.
- Finalized batch reads and transaction status checks; history and status are pinned to the same block.
- Consumer search, camera QR scanning, shareable QR labels, custody timeline, role-based forms, and wallet-redirect transaction recovery.

## Decisions to review before extending the model

1. **Who signs:** the partner wallet signs each action. POST endpoints prepare a request; they do not secretly act as the partner or submit server-signed writes. The contract is the authorization boundary.
2. **Who approves partners:** one contract owner assigns roles. This is a trusted registry, not permissionless producer identity verification. Consumer is the revocation role.
3. **What a handoff means:** this version records a unilateral declaration by the sender. Add propose/accept custody with expiry if the recipient must attest to receipt.
4. **Batch identity:** producer-prefixed UUIDs prevent cross-producer ID squatting. IDs are unique within a deployment; QR links identify the frontend/network. No batch splitting, merging, returns, or recalls yet.
5. **Storage:** one batch header plus one record per custody event; bounded page reads. Metadata bytes stay off-chain with an immutable URI and SHA-256 commitment. The app displays the commitment but does not yet download and verify metadata bytes.
6. **Verification boundary:** the UI trusts its API/RPC response. Offer independent contract queries/explorer evidence for audits. A recorded statement does not prove that the physical smoothie or label is authentic.

See [architecture and tradeoffs](docs/ARCHITECTURE.md), [endpoint examples](docs/API.md), [deployment](docs/DEPLOYMENT.md), and [final-year evaluation plan](docs/EVALUATION.md).

Completed checks and environment limitations are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md). The JavaScript tests and production builds passed; Rust, live wallet transactions and browser behavior still need verification.

## Version references

Checked during scaffolding on 2026-09-18: the live [near-sdk documentation](https://docs.rs/near-sdk/latest/near_sdk/) reported **5.29.1**; npm reported **near-api-js 7.3.1** and **Wallet Selector 10.1.4**. These NEAR dependencies are pinned. The npm lockfile captures the resolved JavaScript dependency tree. The project uses the [shadcn Vite/Tailwind setup](https://ui.shadcn.com/docs/installation/vite), with local component source that can be extended through the shadcn CLI.

Do not use real personal data or secrets in product metadata. On-chain state and events are public.

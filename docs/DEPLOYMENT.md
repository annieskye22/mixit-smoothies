# Deployment: testnet first

No accounts have been created and no contract has been deployed by this scaffold. You need funded testnet accounts and the authority to deploy to your selected contract account. Keep the contract in a dedicated account/subaccount separate from everyday partner wallets.

## Tooling and contract checks

Install Rust stable from the official Rust installer. Windows native builds need the matching C++ build tools; WSL2 is convenient for NEAR sandbox testing. Then:

```text
rustup target add wasm32-unknown-unknown
cargo install cargo-near --locked
npm install -g near-cli-rs
```

From the project root:

```text
npm run test:contract
npm run build:contract
```

The build command uses cargo-near's `non-reproducible-wasm` path for local iteration. Check its printed artifact path (normally `contract/target/near/mixit_smoothies.wasm`). Use cargo-near's reproducible build flow for a reviewed production release. Generate and commit Cargo.lock after the first successful Rust dependency resolution, and pin the tested Rust/cargo-near versions for your submission.

## Accounts and atomic initialization

Use `near` interactive mode (current [NEAR CLI reference](https://docs.near.org/tools/cli)).

1. Import your funded `.testnet` deployment account through `near account import-account using-web-wallet network-config testnet`.
2. Create/fund a dedicated contract subaccount, e.g. `mixit.yourname.testnet`, and separate producer/distributor/retailer accounts. The deployment key must control the contract account.
3. Run `near contract deploy` interactively. Choose the contract account, WASM artifact, **with-init-call**, method `new`, arguments `{"owner_id":"yourname.testnet"}`, prepaid gas 30 Tgas, deposit 0 NEAR, and testnet. Sign through your chosen local credential mechanism.
4. Deploy and initialize in the SAME transaction. A separate uninitialized deployment leaves `new` open to another caller claiming ownership.
5. Verify `get_owner` and the deployed code hash. Save the deployment transaction hash and WASM checksum in your evaluation evidence.

Account naming: `.testnet` is used here for testnet. Your `.near` wallet account is a mainnet account and cannot be reused as the same testnet account.

## Onboard participants

As the owner, run `near contract call-function as-transaction` interactively. Choose your contract, method `set_role`, JSON arguments such as below, 30 Tgas, attached deposit 0.01 NEAR, signer = owner, network = testnet. Unused storage deposit is refunded.

```json
{ "account_id": "farm.testnet", "role": "Producer" }
```

Repeat with `Distributor` and `Retailer` for the other accounts. `Consumer` revokes write privileges. Confirm each assignment using `get_role` with `{"account_id":"farm.testnet"}`. Role administration is deliberately a CLI operation in this scaffold, not an exposed backend signing service.

## Configure and run the application

Copy `.env.example` files and set:

```dotenv
# backend/.env
NEAR_NETWORK=testnet
NEAR_CONTRACT_ID=mixit.yourname.testnet
NEAR_RPC_URL=https://rpc.testnet.near.org
CORS_ORIGIN=http://localhost:5173
PORT=3001
```

Run `npm run dev`. Connect the producer wallet, register a batch, save the ID/QR, transfer it to the distributor, then switch wallets and transfer to the retailer. Verify the trail while disconnected. Inspect all three transactions and emitted logs in a testnet explorer. Test rejection paths with an unregistered account.

In production, build with `npm run build`; run the API via `npm run start -w backend` behind HTTPS. Serve `frontend/dist` with an SPA fallback. Either reverse-proxy `/api` to the backend or set `VITE_API_BASE_URL` to the HTTPS API origin **before building** and configure `CORS_ORIGIN` to the frontend origin. Camera scanning requires HTTPS outside localhost. The static Vite preview command does not provide the development API proxy; use the production origin configuration when testing that build.

Bind the API behind an appropriate reverse proxy; configure Express trust-proxy only for that known proxy before relying on client-IP rate limiting. Use a shared rate-limit store when scaling horizontally. Configure RPC monitoring, bounded timeouts, request IDs, and persistent log collection for production. The `/health` endpoint is only process liveness.

## Mainnet gate

- Pass Rust, API, frontend, NEAR sandbox, and real testnet acceptance tests; retain evidence.
- Audit roles, deposits/refunds, deployment authority, migration compatibility, and application dependencies.
- Establish participant identity vetting, key backup/recovery, upgrade governance, and incident procedures.
- Decide recipient acceptance, recalls, metadata hosting, and label anti-counterfeiting requirements.
- Measure gas, storage, finality, and failure behavior on representative batches.
- Deploy to a funded dedicated `.near` account/subaccount with atomic initialization. Use production owner/participant accounts, RPC and origins; set `NEAR_NETWORK=mainnet`. Never point the testnet UI at mainnet by changing only its label.
- Re-onboard roles and register new records. Testnet data does not migrate automatically and should not be represented as mainnet evidence.

See also the official [cargo-near documentation](https://github.com/near/cargo-near).

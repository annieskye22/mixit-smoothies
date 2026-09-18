# Final-year project evaluation plan

## Research question and evidence

Frame the project around a measurable question: can consumers retrieve a tamper-evident, attributable custody trail at acceptable cost and latency, and what trust assumptions remain? Explain why a shared ledger helps independent organizations compared with a conventional database. Avoid claiming the blockchain solves physical authenticity or food safety.

Prepare requirements, a role/use-case diagram, the sequence diagram, state transitions, data dictionary, threat model, interface screenshots, and reproducible setup instructions. Tie each requirement to code, tests, and a demonstration step. Cite the NEAR protocol/SDK and relevant supply-chain literature rather than relying only on tutorials.

## Test layers

| Layer | Included in scaffold | Needed before final submission |
| --- | --- | --- |
| Rust unit tests | Full trail/page reads, roles, duplicate ID, skipped role, non-holder transfer, insufficient storage, revocation, terminal custody, metadata pairing, event fields | Run in Rust environment; add exhaustive field-length boundaries and property tests |
| API tests | Mocked RPC: validation, status/history snapshot, transfer authorization/preparation, pending/failure/success/outage | Real RPC integration, rate-limit and body-limit checks, concurrent/preflight races |
| Frontend unit tests | Raw/QR ID parsing and timestamp precision | Wallet rejection/redirect, form errors, keyboard navigation, camera cleanup on actual devices |
| Build checks | Strict TypeScript and Vite production build | Browser smoke tests in Chromium/Firefox/mobile |
| NEAR sandbox | Not yet implemented | near-workspaces tests for actual WASM execution, rollback, storage refunds, receipts, race/replay behavior |
| Testnet end-to-end | Requires deployed contract and wallets | Three real partner accounts, consumer lookup without wallet, explorer evidence |

Mocked backend tests do not establish contract correctness, and Rust unit mocks do not validate NEAR receipt scheduling. Add a near-workspaces sandbox suite on Linux/WSL2. It should deploy + initialize atomically, fund four accounts, grant roles, execute all three custody stages, and assert that unauthorized, duplicate, terminal, revoked, or underfunded calls fail without changing persisted state. Confirm excess deposits actually return to the payer, accounting for gas.

## Demonstration script

1. Show the contract account, network, code hash, admin, and participant assignments.
2. Connect the producer; register a real test batch. Record storage and gas, hash, emitted event, and generated QR.
3. Attempt a transfer from an unrelated account and a transfer directly to a retailer. Show contract rejections, including calls bypassing the frontend.
4. Transfer producer → distributor → retailer using their own wallets.
5. Scan the QR on a second device while disconnected. Show actors, timestamps, roles, status, and block reference.
6. Demonstrate a pending transaction, wallet rejection, invalid batch, and an RPC outage without falsely displaying success.
7. Explain copied QR codes and false input declarations. Propose recipient acknowledgment and tamper-evident labels as future work.

## Metrics

Record registration/transfer gas burnt, storage-byte growth and cost, end-to-end wallet-to-finality latency, API lookup p50/p95, response sizes, and success/error rates. Use multiple runs, disclose network variability and sample sizes, and separate wallet interaction time from network latency. Compare with a simple database-backed baseline for latency/cost while discussing different governance and integrity guarantees. Do not invent measurements.

## Valuable extensions, in priority order

1. Two-party handoff acceptance, expiry and dispute handling.
2. Recalls and safety notices that preserve all previous history.
3. Off-chain metadata byte-hash verification, durable hosting, and signed certifications.
4. Batch split/merge lineage with quantity conservation and units.
5. Event indexer plus searchable partner inventory and downloadable audit reports.
6. Unique per-item serial labels, tamper seals, and privacy-aware duplicate-scan detection.
7. Multisig administration, account recovery and explicit upgrade/migration governance.

Use a short usability study to test whether consumers understand the distinction between “record exists on-chain” and “product is authentic.” Include limitations, ethics/privacy, reproducibility, and a clear scope statement in the dissertation.

# Scaffold verification

Checked on 2026-09-18.

| Check | Result |
| --- | --- |
| Backend strict TypeScript check | Passed |
| Frontend strict TypeScript check | Passed |
| Backend production compilation | Passed |
| Frontend Vite production build | Passed with `runner` config loader |
| API Vitest tests | 12 passed |
| Frontend Vitest tests | 8 passed |
| Compiled API smoke assertions | 5 passed: health, validation, history, authorization, finalized transaction |
| near-api-js adapter import/initialization | Passed; no live contract query implied |
| npm lockfile completeness | No incomplete non-bundled dependency entries |
| Rust compilation and 13 Rust unit tests | Not run: Rust/cargo unavailable on this machine |
| Actual contract deployment / wallet transactions | Not run: no deployment account or contract provided |
| Browser render, camera and wallet redirect checks | Not completed: browser automation could not initialize |
| Development server end-to-end smoke | Blocked by sandbox: tsx user-info lookup and esbuild dependency optimizer ancestor-directory access failed |

JavaScript checks ran on the host's Node 22.19.0. `near-api-js 7.3.1` declares Node >=22.22.2, which is the project's documented engine and `.nvmrc`. Re-run checks under that supported runtime before deployment; passing checks on this host do not establish official runtime compatibility.

Dependencies were installed with lifecycle scripts disabled after interrupted network/native installation attempts. The installed esbuild binary was subsequently available and successfully transformed code, built the frontend and ran Vitest. On a normal development machine, use `npm ci` to install all platform dependencies with their normal lifecycle scripts.

The final frontend build still reports a large JavaScript chunk (about 1.56 MB before gzip) and `eval` use inside the Wallet Selector dependency `js-sha256`. These are upstream/bundle optimization follow-ups, not test failures. Split wallet/scanner code and review dependency/CSP behavior before a production release. The earlier browser-externalized `util` warning was addressed through a browser dependency and Vite alias; a Buffer polyfill is also included for MyNearWallet.

No chain state was created or changed. A placeholder contract ID was used only in a temporary local process environment during the unsuccessful development-server smoke attempt. It is not a deployed project account and is not saved as application configuration.

## Subsequent GitHub verification

The initial [GitHub Actions run](https://github.com/annieskye22/mixit-smoothies/actions/runs/35359155757) ran all 13 Rust tests successfully, as well as all 20 JavaScript tests, type checks and JavaScript production builds under Node 22. Its WASM build did not start because compiling cargo-near from source failed on missing `libudev` headers. CI now installs a pinned, checksum-verified cargo-near release binary and uploads the deployable WASM after a successful build.

The public account `lil-akirabear.testnet` was subsequently confirmed on testnet with approximately 10 testnet NEAR and no deployed contract. This confirms account existence and funding, not deployment authorization or contract deployment. Add and execute the sandbox and testnet acceptance tests in [EVALUATION.md](EVALUATION.md) before calling the system end-to-end verified.

## Verified deployment artifact — 2026-09-20

[CI run 35486066121](https://github.com/annieskye22/mixit-smoothies/actions/runs/35486066121) passed both jobs for commit `fb1f6f10d30c263da7d8a874f535109e6be58739`: 13 Rust tests, 20 JavaScript tests, type checks, production builds and the contract WASM build. The downloaded `mixit-contract` artifact contains a 147,062-byte WASM with SHA-256 `2d32688d103f855d4d28915ebdbcc10eee2008990f1583b557b7703d67f10283`.

The application RPC defaults now use FASTNEAR (`https://test.rpc.fastnear.com` on testnet). Contract compilation itself does not contact an RPC endpoint; both the build and a separate finalized account query succeeded. The account had no contract at the pre-deployment check. After wallet authorization, deployment and live integration verification succeeded as recorded below.

`scripts/test-live.mjs` is an opt-in integration suite using the real compiled Express app and signed testnet transactions. It creates three test participants (0.25 testnet NEAR each), retains an identifiable demonstration trail, and records public transaction hashes and assertion results in a JSON report. It exercises registration, both custody transfers, pagination, event logs, failure rollback, authorization, role revocation, duplicates, invalid routing, terminal custody and API transaction status. It does not automate browser wallet signing or camera scanning.

To run after deploying and initializing an authorized testnet account, first run `npm run build`. Set `MIXIT_LIVE_TESTS=1`, `NEAR_CONTRACT_ID`, `NEAR_TEST_CREDENTIALS` (absolute path to an owner credential JSON with `account_id` and `private_key`), `NEAR_TEST_PARTICIPANTS` (a new private file outside the repo), and `NEAR_TEST_REPORT` (public results path), then run `npm run test:live`. Do not commit credential files. Each run spends testnet funds and creates permanent batch history; use a fresh participants path. Failed runs retain their partial evidence and must be inspected before retrying.

## Live testnet results — 2026-09-20

- Contract account and administrator: `lil-akirabear.testnet`. The administrator also has the Producer role for the dashboard.
- Atomic deployment and initialization: transaction `FddhPoMaLtWG1T8gVqaKAd3rGf144b8gvFPvy1u9eFiS`.
- On-chain WASM downloaded after deployment matched the verified SHA-256 above; NEAR code hash: `43RvpGskEtvEgerTWoQu2Lbk8PqBEAe3SuYS2Z4YXewL`.
- **26 live checks passed**, including real transactions prepared by the Express API, finalized reads, event logs and rejected contract calls. See [complete public test evidence](testnet-live-results.json).
- Demonstration batch: `p-mu995h55.lil-akirabear.testnet:live-mu995h55`, ending at the retailer with three custody events.
- Three dedicated participant subaccounts received 0.25 testnet NEAR each. Their local signing keys are outside the repository and are not used by the API.
- The temporary full-access deployment key was deleted on-chain and its absence verified; an original full-access wallet key remained. Revocation transaction: `AKdp55DKrbxpadHJqUtbUzC76poC4XpzQFcQRs2xFPmV`.
- The local production preview at `http://127.0.0.1:4173` proxies `/api` to the actual backend on port 3001. HTTP checks of the page, configuration and live three-event batch history all passed. Local servers need restarting after the task environment shuts down.

[Deployment evidence](testnet-deployment.json) records artifact provenance, hashes and owner-role/revocation transactions. No mainnet deployment occurred.

Remaining verification: browser rendering, wallet connect/sign/redirect and camera QR scanning require a manual browser check because the browser automation runtime could not initialize. The integration harness signs with test keys, so it does not prove the browser wallet flow. Provider-outage/pending-transaction behavior has unit coverage but was not fault-injected on live testnet. Formal security review, load/gas benchmarking, reproducible container builds, production hosting and real-world provenance attestations remain future work. On-chain custody proves account actions, not physical ingredient authenticity.

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

CI contains Rust tests and a WASM build, but has not been run on a remote runner. Add and execute the sandbox and testnet acceptance tests in [EVALUATION.md](EVALUATION.md) before calling the system end-to-end verified.

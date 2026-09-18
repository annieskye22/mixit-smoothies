# API contract

Base path: `/api`. All reads are forwarded by `near-api-js`; the browser does not perform application chain reads. Wallet Selector's own account/network operations are independent of this read architecture.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | API process/configuration liveness (not RPC health) |
| GET | `/config` | Network and contract ID shared with Wallet Selector |
| GET | `/accounts/:accountId/role` | On-chain role, plus block reference |
| POST | `/batches` | Validate and prepare registration for wallet signature |
| POST | `/batches/:batchId/transfers` | Validate and prepare custody transfer |
| GET | `/batches/:batchId/status` | Full current batch header |
| GET | `/batches/:batchId/history?from_index=0&limit=20` | History page and header from the same finalized block |
| GET | `/transactions/:hash?signer_id=...` | Check receipt of submitted wallet transaction |

Encode IDs in URL paths, e.g. `encodeURIComponent('farm.testnet:local-id')`.

## Register

```json
{
  "signer_id": "farm.testnet",
  "local_id": "ce10a4e4-f97a-4591-8db3-de012d5be891",
  "product_name": "Mango Sunrise",
  "metadata_uri": null,
  "metadata_sha256": null
}
```

Response (200, NOT a completed registration):

```json
{
  "status": "awaiting_wallet_signature",
  "network": "testnet",
  "batch_id": "farm.testnet:ce10a4e4-f97a-4591-8db3-de012d5be891",
  "transaction": {
    "signerId": "farm.testnet",
    "receiverId": "mixit.example.testnet",
    "actions": [{ "type": "FunctionCall", "params": {
      "methodName": "register_batch",
      "args": { "local_id": "ce10a4e4-f97a-4591-8db3-de012d5be891", "product_name": "Mango Sunrise", "metadata_uri": null, "metadata_sha256": null },
      "gas": "100000000000000",
      "deposit": "50000000000000000000000"
    }}]
  }
}
```

The frontend verifies receiver, signer, network, method, exact arguments, gas, and deposit before asking Wallet Selector to sign and submit. Supplying someone else's signer ID cannot authorize a write. The wallet and contract enforce the actual signing identity.

## Transfer

POST `/batches/farm.testnet%3Alocal-id/transfers`:

```json
{ "signer_id": "farm.testnet", "receiver_id": "distributor.testnet" }
```

Returns the same unsigned request envelope with method `transfer_custody` and arguments `batch_id`, `receiver_id`.

## Read results

Status returns `{data: Batch, block_hash, block_height}`. History returns `{data: CustodyEvent[], batch: Batch, block_hash, block_height, next_index: number|null}`. Continue pagination until `next_index` is null for extended future workflows. The current contract can only produce three events and the UI requests up to 100, so all current events are displayed. Missing batch returns 404. Do not treat an empty result or unavailable RPC as verified.

## Transaction lifecycle and errors

- 200 `{status:"succeeded",hash,receipt_failures:[]}` only after `final_execution_status === "FINAL"` and `SuccessValue`.
- 202 `{status:"pending"|"unknown",hash}`: do not show completion and do not automatically retry the write. An unknown hash may be invalid or not yet propagated. Bound polling in the client and preserve the hash for reconciliation.
- 422 `{status:"failed",hash,error,receipt_failures}`: finalized transaction failure. Fix the cause before resubmitting.
- 400 invalid request/JSON, 403 wrong role/custodian, 404 absent batch, 409 duplicate/invalid transition, 413 oversized body, 429 rate limit, 502 RPC outage.

Application errors use `{error:{code,message,details?}}`. Rate limiting may return framework text; clients should handle non-JSON errors as a generic HTTP failure. Raw RPC exception details are logged server-side rather than returned to consumers. The transaction failure result can include public on-chain execution details.

HTTP submission is not idempotent storage: the API creates no records. Registration retries must reuse the same local ID to prevent duplicate physical lot registration; the frontend persists the requested batch ID before wallet handoff. A transfer retry after success fails the on-chain custodian check. If a wallet returns no hash, inspect wallet activity and the batch record before clearing local tracking.

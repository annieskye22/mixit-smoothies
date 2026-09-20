import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { accountId, batchId, registration, transfer, pagination, type Batch, type Role } from './schema.js';
import type { Chain } from './near.js';
import { join } from 'node:path';

class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export interface Config { contractId: string; network: 'testnet' | 'mainnet'; origin: string; frontendDir?: string; trustProxyHops?: number }
export function createApp(chain: Chain, config: Config) {
  const app = express();
  app.set('trust proxy', config.trustProxyHops ?? 0);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    connectSrc: ["'self'", config.network === 'testnet' ? 'https://test.rpc.fastnear.com' : 'https://free.rpc.fastnear.com'],
    mediaSrc: ["'self'", 'blob:'],
  } } }), cors({ origin: config.origin }), express.json({ limit: '16kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', network: config.network, contract_id: config.contractId }));
  app.get('/api/config', (_req, res) => res.json({ network: config.network, contract_id: config.contractId }));
  app.get('/api/accounts/:accountId/role', async (req, res) => {
    const account_id = accountId.parse(req.params.accountId);
    res.json(await chain.view<Role>('get_role', { account_id }));
  });
  const getBatch = async (id: string) => {
    const result = await chain.view<Batch | null>('get_batch', { batch_id: id });
    if (!result.data) throw new HttpError(404, 'BATCH_NOT_FOUND', 'No on-chain batch matches this ID.');
    return { ...result, data: result.data };
  };
  app.get('/api/batches/:batchId/status', async (req, res) => {
    res.json(await getBatch(batchId.parse(req.params.batchId)));
  });
  app.get('/api/batches/:batchId/history', async (req, res) => {
    const id = batchId.parse(req.params.batchId);
    const page = pagination.parse(req.query);
    const batch = await getBatch(id);
    const history = await chain.view<unknown[]>('get_history', { batch_id: id, ...page }, batch.block_hash);
    res.json({ ...history, batch: batch.data, next_index: page.from_index + history.data.length < batch.data.history_count ? page.from_index + history.data.length : null });
  });
  // These public endpoints prepare unsigned requests, NOT authorized server-side writes.
  // The contract checks the real predecessor; signer_id here is only a preflight hint.
  const prepare = (signerId: string, methodName: string, args: Record<string, unknown>) => ({
    status: 'awaiting_wallet_signature', network: config.network,
    transaction: { signerId, receiverId: config.contractId, actions: [{ type: 'FunctionCall', params: {
      methodName, args, gas: '100000000000000', deposit: '50000000000000000000000',
    } }] },
  });
  app.post('/api/batches', async (req, res) => {
    const { signer_id, ...args } = registration.parse(req.body);
    const role = await chain.view<Role>('get_role', { account_id: signer_id });
    if (role.data !== 'Producer') throw new HttpError(403, 'ROLE_REQUIRED', 'Producer role required.');
    const id = `${signer_id}:${args.local_id}`;
    if ((await chain.view<Batch | null>('get_batch', { batch_id: id })).data) throw new HttpError(409, 'DUPLICATE_BATCH', 'Batch ID is already registered.');
    res.json({ ...prepare(signer_id, 'register_batch', args), batch_id: id });
  });
  app.post('/api/batches/:batchId/transfers', async (req, res) => {
    const id = batchId.parse(req.params.batchId);
    const { signer_id, receiver_id } = transfer.parse(req.body);
    const batch = await getBatch(id);
    if (batch.data.custodian !== signer_id) throw new HttpError(403, 'NOT_CUSTODIAN', 'Only the current custodian can transfer.');
    const role = (await chain.view<Role>('get_role', { account_id: signer_id }, batch.block_hash)).data;
    const next = role === 'Producer' ? 'Distributor' : role === 'Distributor' ? 'Retailer' : null;
    if (role !== batch.data.custodian_role || !next || signer_id === receiver_id || (await chain.view<Role>('get_role', { account_id: receiver_id }, batch.block_hash)).data !== next) {
      throw new HttpError(409, 'INVALID_TRANSFER', 'Transfer must follow Producer → Distributor → Retailer with active roles.');
    }
    res.json(prepare(signer_id, 'transfer_custody', { batch_id: id, receiver_id }));
  });
  app.get('/api/transactions/:hash', async (req, res) => {
    const hash = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/).parse(req.params.hash);
    const signer = accountId.parse(req.query.signer_id);
    try {
      const tx = await chain.transaction(hash, signer);
      if (tx.transaction && (tx.transaction.receiver_id !== config.contractId || tx.transaction.signer_id !== signer)) throw new HttpError(400, 'WRONG_TRANSACTION', 'Transaction does not target this contract and signer.');
      const failed = typeof tx.status === 'object' && tx.status !== null && 'Failure' in tx.status;
      // A failed refund receipt can coexist with a successful contract call; expose it separately.
      const receiptFailures = (tx.receipts_outcome ?? []).filter((r: any) => r.outcome?.status?.Failure).map((r: any) => r.id);
      if (tx.final_execution_status !== 'FINAL') return res.status(202).json({ status: 'pending', hash, finality: tx.final_execution_status ?? 'UNKNOWN' });
      if (failed) return res.status(422).json({ status: 'failed', hash, error: tx.status.Failure, receipt_failures: receiptFailures });
      if (!tx.status || typeof tx.status !== 'object' || !('SuccessValue' in tx.status)) return res.status(202).json({ status: 'pending', hash });
      return res.json({ status: 'succeeded', hash, receipt_failures: receiptFailures });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/UNKNOWN_TRANSACTION|doesn't exist|not found/i.test(message)) return res.status(202).json({ status: 'unknown', hash, message: 'Transaction not yet visible. Retry; do not assume failure.' });
      throw error;
    }
  });
  if (config.frontendDir) {
    app.use(express.static(config.frontendDir, { index: false }));
    app.get('/', (_req, res) => res.sendFile(join(config.frontendDir!, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
  }
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }));
  const errors: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof z.ZodError) return void res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid request.', details: err.issues } });
    if (err instanceof HttpError) return void res.status(err.status).json({ error: { code: err.code, message: err.message } });
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') return void res.status(err.status).json({ error: { code: 'INVALID_BODY', message: 'Body must be valid JSON under 16 KB.' } });
    console.error('RPC request failed:', err instanceof Error ? err.message : 'Unknown error');
    res.status(502).json({ error: { code: 'RPC_UNAVAILABLE', message: 'NEAR RPC request failed. Retry shortly; an unconfirmed transaction may still complete.' } });
  };
  app.use(errors);
  return app;
}

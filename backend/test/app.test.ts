import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { Chain } from '../src/near.js';
const batch = { batch_id: 'farm.testnet:one', custodian: 'farm.testnet', custodian_role: 'Producer', history_count: 3 };
function fixture() {
  const view = vi.fn(async (method: string, args: any) => ({ data: method === 'get_role' ? (args.account_id === 'ship.testnet' ? 'Distributor' : 'Producer') : method === 'get_history' ? [{ index: 1 }] : batch, block_hash: 'block', block_height: 42 }));
  const transaction = vi.fn();
  const app = createApp({ view, transaction } as unknown as Chain, { contractId: 'mixit.testnet', network: 'testnet', origin: 'http://localhost:5173' });
  return { app, view, transaction };
}
describe('API trust boundary and error handling', () => {
  it('prepares a new registration without submitting a transaction', async () => {
    const { app, view, transaction } = fixture();
    view.mockResolvedValueOnce({ data: 'Producer', block_hash: 'b', block_height: 1 });
    view.mockResolvedValueOnce({ data: null as any, block_hash: 'b', block_height: 1 });
    const r = await request(app).post('/api/batches').send({ signer_id: 'farm.testnet', local_id: 'new-lot', product_name: 'Mango Sunrise' });
    expect(r.status).toBe(200); expect(r.body.batch_id).toBe('farm.testnet:new-lot');
    expect(r.body.transaction.actions[0].params.args.metadata_uri).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects a duplicate registration', async () => {
    const { app } = fixture();
    expect((await request(app).post('/api/batches').send({ signer_id: 'farm.testnet', local_id: 'one', product_name: 'Juice' })).status).toBe(409);
  });
  it('rejects metadata without a hash', async () => {
    const { app } = fixture();
    expect((await request(app).post('/api/batches').send({ signer_id: 'farm.testnet', local_id: 'one', product_name: 'Juice', metadata_uri: 'https://example.com/lot.json' })).status).toBe(400);
  });
  it('rejects malformed input before RPC', async () => { const { app, view } = fixture(); expect((await request(app).post('/api/batches').send({})).status).toBe(400); expect(view).not.toHaveBeenCalled(); });
  it('returns 404 for absent batch', async () => { const { app, view } = fixture(); view.mockResolvedValueOnce({ data: null as any, block_hash: 'b', block_height: 1 }); expect((await request(app).get('/api/batches/farm.testnet:one/status')).status).toBe(404); });
  it('pins history to the status block', async () => { const { app, view } = fixture(); const r = await request(app).get('/api/batches/farm.testnet:one/history?from_index=1&limit=1'); expect(r.status).toBe(200); expect(r.body.next_index).toBe(2); expect(view).toHaveBeenLastCalledWith('get_history', { batch_id: 'farm.testnet:one', from_index: 1, limit: 1 }, 'block'); });
  it('rejects unauthorized transfer preparation', async () => { const { app } = fixture(); expect((await request(app).post('/api/batches/farm.testnet:one/transfers').send({ signer_id: 'evil.testnet', receiver_id: 'ship.testnet' })).status).toBe(403); });
  it('prepares an unsigned transfer with fixed receiver and method', async () => { const { app } = fixture(); const r = await request(app).post('/api/batches/farm.testnet:one/transfers').send({ signer_id: 'farm.testnet', receiver_id: 'ship.testnet' }); expect(r.status).toBe(200); expect(r.body.status).toBe('awaiting_wallet_signature'); expect(r.body.transaction.receiverId).toBe('mixit.testnet'); expect(r.body.transaction.actions[0].params.methodName).toBe('transfer_custody'); });
  it('does not report pre-final execution as success', async () => { const { app, transaction } = fixture(); transaction.mockResolvedValue({ status: { SuccessValue: '' }, final_execution_status: 'EXECUTED' }); expect((await request(app).get(`/api/transactions/${'1'.repeat(44)}?signer_id=farm.testnet`)).status).toBe(202); });
  it('reports final execution failure', async () => { const { app, transaction } = fixture(); transaction.mockResolvedValue({ status: { Failure: { reason: 'denied' } }, final_execution_status: 'FINAL' }); expect((await request(app).get(`/api/transactions/${'1'.repeat(44)}?signer_id=farm.testnet`)).status).toBe(422); });
  it('reports final success', async () => { const { app, transaction } = fixture(); transaction.mockResolvedValue({ status: { SuccessValue: '' }, final_execution_status: 'FINAL' }); expect((await request(app).get(`/api/transactions/${'1'.repeat(44)}?signer_id=farm.testnet`)).body.status).toBe('succeeded'); });
  it('distinguishes unknown transactions from RPC outages', async () => { const { app, transaction } = fixture(); transaction.mockRejectedValueOnce(new Error('UNKNOWN_TRANSACTION')); expect((await request(app).get(`/api/transactions/${'1'.repeat(44)}?signer_id=farm.testnet`)).body.status).toBe('unknown'); transaction.mockRejectedValueOnce(new Error('connection refused')); expect((await request(app).get(`/api/transactions/${'1'.repeat(44)}?signer_id=farm.testnet`)).status).toBe(502); });
});

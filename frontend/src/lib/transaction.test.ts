import { describe, it, expect } from 'vitest';
import { validatePrepared } from './transaction';
import type { Config, Prepared } from './api';
const config: Config = { network: 'testnet', contract_id: 'mixit.testnet' };
const args = { batch_id: 'farm.testnet:one', receiver_id: 'ship.testnet' };
const fixture = (): Prepared => ({ network: 'testnet', transaction: { signerId: 'farm.testnet', receiverId: 'mixit.testnet', actions: [{ type: 'FunctionCall', params: { methodName: 'transfer_custody', args: { ...args }, gas: '100000000000000', deposit: '50000000000000000000000' } }] } });
const validate = (value: Prepared) => validatePrepared(value, config, 'farm.testnet', 'transfer_custody', args);
describe('wallet transaction boundary', () => {
  it('accepts the exact requested operation', () => expect(() => validate(fixture())).not.toThrow());
  it('rejects a substituted contract', () => { const value = fixture(); value.transaction.receiverId = 'evil.testnet'; expect(() => validate(value)).toThrow(); });
  it('rejects an inflated deposit', () => { const value = fixture(); value.transaction.actions[0].params.deposit = '1000000000000000000000000'; expect(() => validate(value)).toThrow(); });
  it('rejects a changed recipient', () => { const value = fixture(); value.transaction.actions[0].params.args.receiver_id = 'evil.testnet'; expect(() => validate(value)).toThrow(); });
  it('rejects network mismatch', () => { const value = fixture(); value.network = 'mainnet'; expect(() => validate(value)).toThrow(); });
});

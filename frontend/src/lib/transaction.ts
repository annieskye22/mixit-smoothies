import type { Config, Prepared } from './api';
// Bind signing to this app's contract, method and exact form inputs.
export function validatePrepared(prepared: Prepared, config: Config, signer: string, method: string, args: Record<string, unknown>) {
  const tx = prepared?.transaction;
  const action = tx?.actions?.[0];
  const actual = action?.params?.args;
  const sameArgs = actual && Object.keys(actual).length === Object.keys(args).length && Object.entries(args).every(([key, value]) => actual[key] === value);
  if (!tx || !action || prepared.network !== config.network || tx.receiverId !== config.contract_id || tx.signerId !== signer || tx.actions.length !== 1 || action.type !== 'FunctionCall' || action.params.methodName !== method || !sameArgs || action.params.gas !== '100000000000000' || action.params.deposit !== '50000000000000000000000') throw new Error('Transaction request does not match your action.');
}

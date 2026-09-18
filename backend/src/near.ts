import { JsonRpcProvider } from 'near-api-js';
export interface ViewResult<T> { data: T; block_hash: string; block_height: number }
export interface Chain {
  view<T>(method: string, args: Record<string, unknown>, blockId?: string): Promise<ViewResult<T>>;
  transaction(hash: string, signer: string): Promise<any>;
}
export function createChain(rpcUrl: string, contractId: string): Chain {
  const provider = new JsonRpcProvider({ url: rpcUrl }, { retries: 2, wait: 500, backoff: 1.5 });
  return {
    async view<T>(method: string, args: Record<string, unknown>, blockId?: string) {
      const result = await provider.query({ request_type: 'call_function', account_id: contractId,
        method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
        ...(blockId ? { block_id: blockId } : { finality: 'final' }) });
      if (!('result' in result) || !Array.isArray(result.result) || !result.result.every((byte: unknown) => typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error('Unexpected RPC result');
      return { data: JSON.parse(Buffer.from(result.result).toString()) as T, block_hash: result.block_hash, block_height: result.block_height };
    },
    transaction: (hash, signer) => provider.sendJsonRpc('tx', { tx_hash: hash, sender_account_id: signer, wait_until: 'NONE' }),
  };
}

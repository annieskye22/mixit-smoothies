export type Role = 'Producer' | 'Distributor' | 'Retailer' | 'Consumer';
export interface Config { network: 'testnet' | 'mainnet'; contract_id: string }
export interface Batch { batch_id: string; product_name: string; producer: string; custodian: string; custodian_role: Role; status: string; metadata_uri: string | null; metadata_sha256: string | null; created_at_ns: string; history_count: number }
export interface CustodyEvent { index: number; batch_id: string; actor: string; from: string | null; to: string; to_role: Role; timestamp_ns: string; status: string }
export interface History { data: CustodyEvent[]; batch: Batch; block_hash: string; block_height: number; next_index: number | null }
export interface Prepared { network: Config['network']; batch_id?: string; transaction: { signerId: string; receiverId: string; actions: [{ type: 'FunctionCall'; params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string } }] } }
const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${base}/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers }, signal: options?.signal ?? AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => { throw new Error(`API returned HTTP ${res.status}. Please retry shortly.`); });
  if (!res.ok) throw new Error(body.error?.message ?? (body.status === 'failed' ? `Transaction failed: ${JSON.stringify(body.error)}` : `API returned ${res.status}`));
  return body as T;
}
export function parseBatchInput(input: string): string {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    const id = new URL(value).searchParams.get('batch');
    if (!id) throw new Error('The QR link does not contain a batch ID.');
    return id;
  }
  return value;
}
export function dateFromNs(ns: string): string { return new Date(Number(BigInt(ns) / 1_000_000n)).toLocaleString(); }

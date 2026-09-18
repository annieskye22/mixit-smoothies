import { z } from 'zod';
export const accountId = z.string().min(2).max(64).regex(/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/);
export const localId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
export const batchId = z.string().refine(value => {
  const parts = value.split(':');
  return parts.length === 2 && accountId.safeParse(parts[0]).success && localId.safeParse(parts[1]).success;
}, 'Expected producer.account:local-id');
export const registration = z.object({
  signer_id: accountId, local_id: localId, product_name: z.string().trim().min(1).refine(v => Buffer.byteLength(v) <= 120),
  metadata_uri: z.string().max(512).regex(/^(https:\/\/|ipfs:\/\/)\S+$/).nullable().default(null),
  metadata_sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).nullable().default(null),
}).strict().refine(v => Boolean(v.metadata_uri) === Boolean(v.metadata_sha256), 'Supply metadata URI and SHA256 together');
export const transfer = z.object({ signer_id: accountId, receiver_id: accountId }).strict();
export const pagination = z.object({ from_index: z.coerce.number().int().min(0).max(4294967295).default(0), limit: z.coerce.number().int().min(1).max(100).default(20) });
export type Role = 'Producer' | 'Distributor' | 'Retailer' | 'Consumer';
export interface Batch { batch_id: string; product_name: string; producer: string; custodian: string; custodian_role: Role; status: string; metadata_uri: string | null; metadata_sha256: string | null; created_at_ns: string; history_count: number }

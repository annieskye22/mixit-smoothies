import 'dotenv/config';
import { z } from 'zod';
import { createApp } from './app.js';
import { createChain } from './near.js';
import { accountId } from './schema.js';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  NEAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  NEAR_CONTRACT_ID: accountId,
  NEAR_RPC_URL: z.url().optional(),
  CORS_ORIGIN: z.url().optional(),
  RENDER_EXTERNAL_URL: z.url().optional(),
  SERVE_FRONTEND: z.enum(['true', 'false']).default('false'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
}).parse(process.env);
if (env.NEAR_CONTRACT_ID === 'mixit.your-account.testnet') throw new Error('Configure NEAR_CONTRACT_ID before starting.');
if (env.NEAR_NETWORK === 'testnet' && !env.NEAR_CONTRACT_ID.endsWith('.testnet')) throw new Error('Use a .testnet contract on testnet.');
if (env.NEAR_NETWORK === 'mainnet' && env.NEAR_CONTRACT_ID.endsWith('.testnet')) throw new Error('A .testnet contract cannot be used on mainnet.');
const defaultRpcUrl = env.NEAR_NETWORK === 'testnet' ? 'https://test.rpc.fastnear.com' : 'https://free.rpc.fastnear.com';
const chain = createChain(env.NEAR_RPC_URL ?? defaultRpcUrl, env.NEAR_CONTRACT_ID);
const frontendDir = env.SERVE_FRONTEND === 'true' ? fileURLToPath(new URL('../../frontend/dist/', import.meta.url)) : undefined;
if (frontendDir && !existsSync(frontendDir + 'index.html')) throw new Error('Build the frontend before starting the public server.');
const server = createApp(chain, { contractId: env.NEAR_CONTRACT_ID, network: env.NEAR_NETWORK,
  origin: env.CORS_ORIGIN ?? env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173', frontendDir, trustProxyHops: env.TRUST_PROXY_HOPS })
  .listen(env.PORT, '0.0.0.0', () => console.log(`Mixit API http://localhost:${env.PORT} (${env.NEAR_NETWORK})`));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());

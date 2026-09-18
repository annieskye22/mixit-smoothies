import 'dotenv/config';
import { z } from 'zod';
import { createApp } from './app.js';
import { createChain } from './near.js';
import { accountId } from './schema.js';
const env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  NEAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  NEAR_CONTRACT_ID: accountId,
  NEAR_RPC_URL: z.url().optional(),
  CORS_ORIGIN: z.url().default('http://localhost:5173'),
}).parse(process.env);
if (env.NEAR_CONTRACT_ID === 'mixit.your-account.testnet') throw new Error('Configure NEAR_CONTRACT_ID before starting.');
if (env.NEAR_NETWORK === 'testnet' && !env.NEAR_CONTRACT_ID.endsWith('.testnet')) throw new Error('Use a .testnet contract on testnet.');
if (env.NEAR_NETWORK === 'mainnet' && env.NEAR_CONTRACT_ID.endsWith('.testnet')) throw new Error('A .testnet contract cannot be used on mainnet.');
const chain = createChain(env.NEAR_RPC_URL ?? `https://rpc.${env.NEAR_NETWORK}.near.org`, env.NEAR_CONTRACT_ID);
const server = createApp(chain, { contractId: env.NEAR_CONTRACT_ID, network: env.NEAR_NETWORK, origin: env.CORS_ORIGIN })
  .listen(env.PORT, () => console.log(`Mixit API http://localhost:${env.PORT} (${env.NEAR_NETWORK})`));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());

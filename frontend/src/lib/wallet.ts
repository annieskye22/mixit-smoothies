import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupModal } from '@near-wallet-selector/modal-ui-js';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import '@near-wallet-selector/modal-ui-js/styles.css';
import type { Config } from './api';
export async function initWallet(config: Config) {
  const selector = await setupWalletSelector({ network: config.network, modules: [setupMyNearWallet()] });
  const modal = setupModal(selector, { contractId: config.contract_id });
  return { selector, modal };
}
export type WalletSession = Awaited<ReturnType<typeof initWallet>>;

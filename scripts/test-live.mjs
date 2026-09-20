// Opt-in integration suite: creates funded testnet subaccounts and permanent test batches.
// Keep credentials outside the repository. Run only against an authorized testnet deployment.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Account, JsonRpcProvider, KeyPair, actions } from 'near-api-js';
import { createApp } from '../backend/dist/app.js';
import { createChain } from '../backend/dist/near.js';

assert.equal(process.env.MIXIT_LIVE_TESTS, '1', 'Explicitly enable MIXIT_LIVE_TESTS=1');
assert(process.env.NEAR_TEST_CREDENTIALS && process.env.NEAR_TEST_PARTICIPANTS && process.env.NEAR_TEST_REPORT, 'Set paths for owner credentials, private participant keys and public report');
const credentials = JSON.parse(fs.readFileSync(process.env.NEAR_TEST_CREDENTIALS));
const contract = process.env.NEAR_CONTRACT_ID;
assert(contract?.endsWith('.testnet') && credentials.account_id === contract, 'Testnet owner account required');
const rpc = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';
const provider = new JsonRpcProvider({ url: rpc });
const owner = new Account(contract, provider, credentials.private_key);
const chain = createChain(rpc, contract);
assert.equal((await chain.view('get_owner', {})).data, contract);
assert(!fs.existsSync(process.env.NEAR_TEST_PARTICIPANTS), 'Use a fresh participants path per run; never silently repeat funding');
const run = Date.now().toString(36);
const report = { network: 'testnet', contract, rpc, run, started_at: new Date().toISOString(), checks: [], transactions: [], passed: false };
const save = () => fs.writeFileSync(process.env.NEAR_TEST_REPORT, JSON.stringify(report, null, 2) + '\n');
const check = (name, test) => { test(); report.checks.push(name); save(); console.log('PASS', name); };
const participants = Object.fromEntries(['producer', 'distributor', 'retailer'].map(role => {
  const key = KeyPair.fromRandom('ed25519');
  return [role, { account_id: `${role.slice(0, 1)}-${run}.${contract}`, public_key: key.getPublicKey().toString(), private_key: key.toString() }];
}));
fs.writeFileSync(process.env.NEAR_TEST_PARTICIPANTS, JSON.stringify(participants), { mode: 0o600, flag: 'wx' });
const people = Object.fromEntries(Object.entries(participants).map(([role, c]) => [role, new Account(c.account_id, provider, c.private_key)]));
const id = role => participants[role].account_id;
report.participants = Object.fromEntries(Object.entries(participants).map(([role, c]) => [role, c.account_id]));
async function send(account, receiverId, txActions, label, expectedFailure) {
  const tx = await account.signAndSendTransaction({ receiverId, actions: txActions, waitUntil: 'FINAL', throwOnFailure: false });
  report.transactions.push({ label, hash: tx.transaction.hash, signer: tx.transaction.signer_id, status: tx.status, logs: tx.receipts_outcome.flatMap(r => r.outcome.logs) });
  save();
  assert.equal(tx.final_execution_status, 'FINAL');
  if (expectedFailure) check(label, () => assert.match(JSON.stringify(tx.status.Failure), expectedFailure));
  else check(label, () => { assert('SuccessValue' in tx.status, JSON.stringify(tx.status)); assert(!tx.receipts_outcome.some(r => r.outcome.status.Failure), 'A receipt failed'); });
  return tx;
}
const call = (account, method, args, label, failure, deposit = 50000000000000000000000n) => send(account, contract, [actions.functionCall(method, args, 100000000000000n, deposit)], label, failure);
const app = createApp(chain, { contractId: contract, network: 'testnet', origin: 'http://127.0.0.1:4173' });
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function api(path, method = 'GET', body, status = 200) {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}
async function prepared(account, path, body, label) {
  const request = await api(path, 'POST', body);
  const tx = request.transaction;
  assert.equal(tx.signerId, account.accountId);
  assert.equal(tx.receiverId, contract);
  assert.equal(tx.actions.length, 1);
  const { methodName, args, gas, deposit } = tx.actions[0].params;
  assert(['register_batch', 'transfer_custody'].includes(methodName));
  assert.equal(gas, '100000000000000');
  assert.equal(deposit, '50000000000000000000000');
  return send(account, contract, [actions.functionCall(methodName, args, BigInt(gas), BigInt(deposit))], label);
}
try {
  for (const [role, c] of Object.entries(participants)) {
    await send(owner, c.account_id, [actions.createAccount(), actions.transfer(250000000000000000000000n), actions.addFullAccessKey(KeyPair.fromString(c.private_key).getPublicKey())], `Create ${role} (0.25 test NEAR)`);
    await call(owner, 'set_role', { account_id: c.account_id, role: role[0].toUpperCase() + role.slice(1) }, `Assign ${role}`);
  }
  await call(people.distributor, 'set_role', { account_id: id('distributor'), role: 'Producer' }, 'Reject non-owner role assignment', /Only owner/);
  const args = { local_id: `live-${run}`, product_name: 'Mixit testnet acceptance smoothie', metadata_uri: null, metadata_sha256: null };
  const batch = `${id('producer')}:${args.local_id}`;
  report.batch_id = batch;
  const path = `/batches/${encodeURIComponent(batch)}`;
  await call(people.retailer, 'register_batch', args, 'Reject unauthorized registration', /Producer role required/);
  await call(people.producer, 'register_batch', args, 'Reject insufficient deposit', /Insufficient storage deposit/, 0n);
  const afterFailure = await chain.view('get_batch', { batch_id: batch });
  check('Failed registration leaves no batch', () => assert.equal(afterFailure.data, null));
  const reg = await prepared(people.producer, '/batches', { signer_id: id('producer'), ...args }, 'API-prepared registration succeeds on chain');
  await call(people.producer, 'register_batch', args, 'Reject duplicate registration', /Batch already exists/);
  await api('/batches', 'POST', { signer_id: id('producer'), ...args }, 409);
  await call(people.producer, 'transfer_custody', { batch_id: batch, receiver_id: id('retailer') }, 'Reject skipped distributor', /Recipient has wrong role/);
  await call(people.retailer, 'transfer_custody', { batch_id: batch, receiver_id: id('distributor') }, 'Reject non-custodian', /Only current custodian/);
  await call(owner, 'set_role', { account_id: id('producer'), role: 'Consumer' }, 'Revoke producer');
  await call(people.producer, 'transfer_custody', { batch_id: batch, receiver_id: id('distributor') }, 'Reject revoked custodian', /Custodian role revoked/);
  await call(owner, 'set_role', { account_id: id('producer'), role: 'Producer' }, 'Restore producer');
  await prepared(people.producer, path + '/transfers', { signer_id: id('producer'), receiver_id: id('distributor') }, 'API-prepared distributor handoff succeeds');
  const last = await prepared(people.distributor, path + '/transfers', { signer_id: id('distributor'), receiver_id: id('retailer') }, 'API-prepared retailer handoff succeeds');
  const failed = await call(people.retailer, 'transfer_custody', { batch_id: batch, receiver_id: id('producer') }, 'Reject transfer beyond retailer', /Retail custody is terminal/);
  const history = await api(path + '/history');
  check('Finalized API history contains exactly three ordered custody events', () => {
    assert.equal(history.data.length, 3);
    assert.deepEqual(history.data.map(e => e.status), ['Registered', 'InDistribution', 'AtRetailer']);
    assert.deepEqual(history.data.map(e => e.to), [id('producer'), id('distributor'), id('retailer')]);
    assert.deepEqual(history.data.map(e => e.actor), [id('producer'), id('producer'), id('distributor')]);
    assert.deepEqual(history.data.map(e => e.from), [null, id('producer'), id('distributor')]);
    history.data.forEach((e, i) => { assert.equal(e.index, i); assert.match(e.timestamp_ns, /^\d+$/); if(i) assert(BigInt(e.timestamp_ns) >= BigInt(history.data[i-1].timestamp_ns)); });
    assert.equal(history.next_index, null);
  });
  const status = await api(path + '/status');
  check('Current status and custodian match completed trail', () => { assert.equal(status.data.status, 'AtRetailer'); assert.equal(status.data.custodian, id('retailer')); assert.equal(status.data.history_count, 3); });
  const page = await api(path + '/history?from_index=1&limit=1');
  check('History pagination', () => { assert.deepEqual(page.data, [history.data[1]]); assert.equal(page.next_index, 2); });
  const txStatus = await api(`/transactions/${last.transaction.hash}?signer_id=${id('distributor')}`);
  const failedStatus = await api(`/transactions/${failed.transaction.hash}?signer_id=${id('retailer')}`, 'GET', undefined, 422);
  check('API distinguishes finalized success and contract failure', () => { assert.equal(txStatus.status, 'succeeded'); assert.equal(failedStatus.status, 'failed'); });
  const events = report.transactions.flatMap(t => t.logs.filter(l => l.startsWith('EVENT_JSON:')).map(l => JSON.parse(l.slice(11))));
  check('Indexable logs match registration and handoffs', () => { assert.equal(events.filter(e => e.event === 'batch_registered').length, 1); assert.equal(events.filter(e => e.event === 'custody_transferred').length, 2); events.forEach(e => { assert.equal(e.standard, 'mixit_trace'); assert.equal(e.version, '1.0.0'); }); });
  await api('/batches/invalid/history', 'GET', undefined, 400);
  await api(`/batches/${encodeURIComponent(contract + ':missing-' + run)}/status`, 'GET', undefined, 404);
  report.checks.push('API rejects invalid and missing batch IDs');
  report.registration_hash = reg.transaction.hash;
  report.final_block = { hash: history.block_hash, height: history.block_height };
  report.history = history.data;
  report.passed = true;
} catch (error) {
  report.error = error.message;
  throw error;
} finally {
  report.completed_at = new Date().toISOString();
  save();
  server.close();
}
console.log(`Live testnet suite passed: ${report.checks.length} checks. Batch: ${report.batch_id}`);

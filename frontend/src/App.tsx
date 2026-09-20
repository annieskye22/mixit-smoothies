import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, CheckCircle2, Leaf, Package, QrCode, Search, ShieldCheck, Sprout, Store, Truck, Wallet } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { internalActionToNaj } from '@near-wallet-selector/core';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Scanner } from './components/Scanner';
import { api, dateFromNs, parseBatchInput, type Config, type History, type Prepared, type Role } from './lib/api';
import { initWallet, type WalletSession } from './lib/wallet';
import { validatePrepared } from './lib/transaction';

type Pending = { signer: string; hash?: string; batchId: string; network: string; contractId: string };
const storageKey = 'mixit.pending.v1';
const demoBatch = 'p-mu995h55.lil-akirabear.testnet:live-mu995h55';
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
const icons = { Producer: Sprout, Distributor: Truck, Retailer: Store, Consumer: Search };

export default function App() {
  const [view, setView] = useState<'verify' | 'dashboard'>('verify');
  const [config, setConfig] = useState<Config>();
  const [session, setSession] = useState<WalletSession>();
  const [account, setAccount] = useState('');
  const [role, setRole] = useState<Role>();
  const [error, setError] = useState('');
  const [walletError, setWalletError] = useState('');
  const [batchInput, setBatchInput] = useState(new URLSearchParams(location.search).get('batch') ?? '');
  const [trail, setTrail] = useState<History>();
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [pending, setPending] = useState<Pending>();
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const requestCounter = useRef(0);

  const savePending = (value?: Pending) => {
    setPending(value);
    if (value) localStorage.setItem(storageKey, JSON.stringify(value)); else localStorage.removeItem(storageKey);
  };

  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    api<Config>('/config').then(async c => {
      if (!alive) return;
      setConfig(c);
      const params = new URLSearchParams(location.search);
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const p = JSON.parse(saved) as Pending;
          if (p.network === c.network && p.contractId === c.contract_id) {
            p.hash = params.get('transactionHashes')?.split(',')[0] ?? p.hash;
            if (params.has('errorCode')) { localStorage.removeItem(storageKey); setNotice(`Wallet did not complete the request: ${params.get('errorMessage') ?? params.get('errorCode')}`); }
            else { setPending(p); localStorage.setItem(storageKey, JSON.stringify(p)); setNotice(p.hash ? 'Transaction submitted. Checking finality…' : 'Previous wallet request has no transaction hash. Check your wallet activity before retrying.'); }
          }
        }
      } catch { localStorage.removeItem(storageKey); }
      const clean = new URL(location.href);
      ['transactionHashes', 'errorCode', 'errorMessage'].forEach(k => clean.searchParams.delete(k));
      history.replaceState({}, '', clean);
      try {
        const s = await initWallet(c);
        if (!alive) return;
        setSession(s);
        const update = () => setAccount(s.selector.store.getState().accounts.find(a => a.active)?.accountId ?? '');
        update();
        const subscription = s.selector.store.observable.subscribe(update);
        unsubscribe = () => subscription.unsubscribe();
      } catch (e) { if (alive) setWalletError(`Wallet initialization failed: ${errorText(e)}`); }
    }).catch(e => { if (alive) setError(`API unavailable: ${errorText(e)}. Start the backend and reload this page.`); });
    return () => { alive = false; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    let alive = true;
    setRole(undefined);
    if (account) api<{ data: Role }>(`/accounts/${encodeURIComponent(account)}/role`).then(r => { if (alive) setRole(r.data); }).catch(e => { if (alive) setWalletError(`Role lookup failed: ${errorText(e)}`); });
    return () => { alive = false; };
  }, [account, notice]);

  const verify = useCallback(async (value: string) => {
    const requestId = ++requestCounter.current;
    setBusy(true); setError(''); setTrail(undefined);
    try {
      const id = parseBatchInput(value);
      if (!id) throw new Error('Enter a batch ID or scan a QR label.');
      const result = await api<History>(`/batches/${encodeURIComponent(id)}/history?limit=100`);
      if (requestId !== requestCounter.current) return;
      setTrail(result); setBatchInput(id);
      const url = new URL(location.href); url.searchParams.set('batch', id); history.replaceState({}, '', url);
    } catch (e) { if (requestId === requestCounter.current) setError(errorText(e)); }
    finally { if (requestId === requestCounter.current) setBusy(false); }
  }, []);
  useEffect(() => { const id = new URLSearchParams(location.search).get('batch'); if (id && config) void verify(id); }, [config, verify]);
  const onScan = useCallback((value: string) => { setScanning(false); void verify(value); }, [verify]);

  const checkTransaction = useCallback(async () => {
    if (!pending?.hash) return;
    setChecking(true);
    try {
      const result = await api<{ status: string; receipt_failures?: string[] }>(`/transactions/${pending.hash}?signer_id=${encodeURIComponent(pending.signer)}`);
      if (result.status === 'succeeded') {
        setNotice(`Transaction finalized on NEAR.${result.receipt_failures?.length ? ' A receipt failed; inspect the explorer for refund details.' : ''}`);
        const id = pending.batchId; savePending(); if (id) await verify(id);
      } else setNotice('Transaction is pending or not yet visible. Keep its hash and check again; do not resubmit automatically.');
    } catch (e) { setNotice(errorText(e)); }
    finally { setChecking(false); }
  }, [pending, verify]);
  useEffect(() => { if (pending?.hash) void checkTransaction(); }, [checkTransaction, pending?.hash]);

  async function connect() { try { setWalletError(''); session?.modal.show(); } catch (e) { setWalletError(errorText(e)); } }
  async function disconnect() { try { await (await session?.selector.wallet())?.signOut(); setAccount(''); } catch (e) { setWalletError(errorText(e)); } }

  async function submit(event: FormEvent<HTMLFormElement>, method: 'register_batch' | 'transfer_custody') {
    event.preventDefault();
    if (!session || !config || !account || pending) return;
    setSigning(true); setWalletError(''); setNotice('');
    const form = event.currentTarget;
    const data = new FormData(form);
    let requested: Pending | undefined;
    try {
      const localId = crypto.randomUUID();
      const isRegister = method === 'register_batch';
      const id = isRegister ? `${account}:${localId}` : parseBatchInput(String(data.get('batch_id')));
      const args = isRegister ? { local_id: localId, product_name: String(data.get('product_name')).trim(), metadata_uri: String(data.get('metadata_uri') ?? '').trim() || null, metadata_sha256: String(data.get('metadata_sha256') ?? '').trim() || null }
        : { batch_id: id, receiver_id: String(data.get('receiver_id')).trim() };
      const prepared = await api<Prepared>(isRegister ? '/batches' : `/batches/${encodeURIComponent(id)}/transfers`, { method: 'POST', body: JSON.stringify(isRegister ? { signer_id: account, ...args } : { signer_id: account, receiver_id: args.receiver_id }) });
      validatePrepared(prepared, config, account, method, args);
      requested = { signer: account, batchId: id, network: config.network, contractId: config.contract_id };
      savePending(requested);
      setNotice(`Approve in your wallet. Batch ID: ${id}`);
      const wallet = await session.selector.wallet();
      const callback = new URL(location.origin + location.pathname); callback.searchParams.set('batch', id);
      const result = await wallet.signAndSendTransaction({ ...prepared.transaction, actions: prepared.transaction.actions.map(internalActionToNaj), callbackUrl: callback.href });
      const hash = result?.transaction?.hash;
      if (hash) { savePending({ ...requested, hash }); setNotice('Transaction submitted. Checking finality…'); }
      else setNotice('Continue in your wallet. If no redirect occurs, check wallet activity before retrying.');
    } catch (e) {
      setWalletError(errorText(e));
      if (!requested) savePending();
      else setNotice('The wallet outcome is uncertain. Check wallet activity before clearing tracking and retrying.');
    } finally { setSigning(false); }
  }

  const verificationUrl = trail ? `${location.origin}${location.pathname}?batch=${encodeURIComponent(trail.batch.batch_id)}` : '';
  return <div className="min-h-screen">
    <header className="border-b bg-white/80"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <a href={location.pathname} className="flex items-center gap-3" aria-label="Mixit Smoothies home"><span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-white"><Leaf size={23}/></span><span className="text-2xl font-black tracking-tight">mixit<span className="text-lime-600">.</span><span className="ml-2 hidden text-xs font-medium tracking-[.14em] text-muted-foreground sm:inline">SMOOTHIES</span></span></a>
      <nav className="flex gap-1 rounded-full bg-muted p-1" aria-label="Main navigation">{(['verify', 'dashboard'] as const).map(v => <button key={v} onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined} className={`rounded-full px-4 py-2 text-sm ${view === v ? 'bg-white font-semibold shadow-sm' : 'text-muted-foreground'}`}>{v === 'verify' ? 'Verify a batch' : 'Partner dashboard'}</button>)}</nav>
      <Button variant="outline" onClick={account ? disconnect : connect} disabled={!session}><Wallet/>{account ? `${account} · Disconnect` : 'Connect wallet'}</Button>
    </div></header>
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      {config?.network === 'testnet' && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 text-sm"><p><strong>Testnet demonstration.</strong> Explore a real on-chain custody trail. No wallet needed to verify.</p>{config.contract_id === 'lil-akirabear.testnet' && <Button variant="outline" disabled={busy} onClick={() => { setView('verify'); setBatchInput(demoBatch); void verify(demoBatch); }}>View live demo batch<ArrowRight/></Button>}</div>}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"><span>Good ingredients. A visible journey.</span><span className="rounded-full border bg-white px-3 py-2">NEAR {config?.network ?? 'Connecting…'}</span></div>
      {notice && <div role="status" className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm"><p className="break-words">{notice}</p>{pending && <div className="mt-3 flex flex-wrap items-center gap-3">{pending.hash && <><Button size="sm" variant="outline" disabled={checking} onClick={() => void checkTransaction()}>{checking ? 'Checking…' : 'Check transaction'}</Button><a className="underline" href={`https://${config?.network === 'testnet' ? 'testnet.' : ''}nearblocks.io/txns/${pending.hash}`} target="_blank" rel="noreferrer">View transaction</a></>}<Button size="sm" variant="ghost" onClick={() => { savePending(); setNotice('Tracking cleared locally. Any submitted transaction can still finalize; check the batch before retrying.'); }}>Clear local tracking</Button></div>}</div>}
      {walletError && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{walletError}</p>}
      {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {view === 'verify' ? <>
        <section className="grid items-start gap-10 lg:grid-cols-[1.05fr_1fr]">
          <div><span className="inline-flex items-center gap-2 rounded-full bg-[#e8efcf] px-3 py-2 text-xs font-semibold"><ShieldCheck size={15}/> TRACEABLE BY DESIGN</span><h1 className="display mt-6 text-5xl leading-[1.08] tracking-tight sm:text-6xl">Every blend<br/>has a <span className="italic text-[#628136]">story.</span></h1><p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">Follow your smoothie from its producer to your local store. One batch. Every handoff. Recorded on NEAR.</p><div className="mt-8 flex gap-6 text-sm font-medium"><span className="flex items-center gap-2"><Check size={16}/> Public custody trail</span><span className="flex items-center gap-2"><Check size={16}/> No wallet needed</span></div></div>
          <Card className="overflow-hidden"><div className="h-2 bg-[#d8e7a6]"/><CardHeader><div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted"><QrCode/></div><CardTitle>Meet your smoothie.</CardTitle><p className="text-sm text-muted-foreground">Enter the batch ID printed on your label, or scan its QR code.</p></CardHeader><CardContent><form onSubmit={e => { e.preventDefault(); void verify(batchInput); }} className="space-y-4"><label className="field">Batch ID<Input value={batchInput} onChange={e => setBatchInput(e.target.value)} placeholder="producer.testnet:batch-id" required autoComplete="off"/></label><Button className="w-full" disabled={busy || !config}>{busy ? 'Reading finalized records…' : 'Trace this batch'}<ArrowRight/></Button></form><Button variant="outline" className="mt-3 w-full" onClick={() => setScanning(!scanning)}><QrCode/>{scanning ? 'Hide scanner' : 'Scan QR label'}</Button>{scanning && <Scanner onScan={onScan} onClose={() => setScanning(false)}/>}<p className="mt-4 text-center text-xs text-muted-foreground">Custody records are read from NEAR. The demo batch is a real testnet record.</p></CardContent></Card>
        </section>
        {trail ? <section className="mt-12 grid gap-6 lg:grid-cols-[1fr_300px]" aria-label="Batch verification result"><Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{trail.batch.product_name}</CardTitle><span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 size={14}/> Finalized record</span></div><p className="break-all font-mono text-xs text-muted-foreground">{trail.batch.batch_id}</p></CardHeader><CardContent><ol className="space-y-6">{trail.data.map((event, i) => { const Icon = icons[event.to_role]; return <li key={event.index} className="relative flex gap-4">{i < trail.data.length - 1 && <div className="absolute left-5 top-11 h-[calc(100%-12px)] w-px bg-border"/>}<div className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"><Icon size={19}/></div><div><p className="font-semibold">{event.index === 0 ? 'Registered by producer' : `Transferred to ${event.to_role.toLowerCase()}`}</p><p className="break-all text-sm">{event.to}</p><p className="mt-1 break-all text-xs text-muted-foreground">Actor: {event.actor} · {dateFromNs(event.timestamp_ns)}</p><p className="text-xs text-muted-foreground">Status: {event.status}</p></div></li>; })}</ol><p className="mt-6 text-xs text-muted-foreground">{trail.data.length} of {trail.batch.history_count} entries · Finalized block {trail.block_height}</p><p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{trail.block_hash}</p></CardContent></Card><Card><CardHeader><CardTitle>Batch passport</CardTitle></CardHeader><CardContent className="space-y-5"><div><p className="text-xs text-muted-foreground">CURRENT CUSTODIAN</p><p className="mt-1 break-all text-sm font-semibold">{trail.batch.custodian}</p><p className="text-sm text-muted-foreground">{trail.batch.status}</p></div><QRCodeSVG value={verificationUrl} size={160} title={`Verify ${trail.batch.batch_id}`}/><p className="text-xs text-muted-foreground">Share this QR to open the same batch record.</p>{trail.batch.metadata_uri && <div className="text-xs"><a className="break-all underline" href={trail.batch.metadata_uri.startsWith('https://') ? trail.batch.metadata_uri : `https://ipfs.io/ipfs/${trail.batch.metadata_uri.slice(7)}`} target="_blank" rel="noreferrer">Open external metadata</a><p className="mt-2 break-all">SHA-256: {trail.batch.metadata_sha256}</p><p className="mt-2 text-muted-foreground">File contents are not automatically hash-verified by this page.</p></div>}</CardContent></Card></section>
          : <div className="mt-14 grid gap-5 border-t pt-8 sm:grid-cols-3">{[{ Icon: Sprout, title: '01 · Producer', text: 'Registers the product and its original batch record.' }, { Icon: Truck, title: '02 · Distributor', text: 'Takes custody and records the next handoff.' }, { Icon: Store, title: '03 · Retailer', text: 'Holds the final batch record for you to inspect.' }].map(({ Icon, title, text }) => <div key={title}><Icon className="mb-3 text-[#72824e]" size={23}/><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></div>)}</div>}
      </> : <section><h1 className="display text-4xl sm:text-5xl">Your part in the journey.</h1><p className="mt-4 text-muted-foreground">Register products and record custody handoffs with your NEAR account.</p><div className="my-7 flex flex-wrap gap-3 text-sm"><span className="rounded-full bg-muted px-4 py-2">{account || 'Wallet disconnected'}</span><span className="rounded-full border px-4 py-2">Role: {account ? role ?? 'Loading…' : 'Consumer'}</span></div>
        {!account ? <Card><CardContent className="pt-6"><Wallet className="mb-4"/><p className="mb-4">Connect your wallet to access partner actions.</p><Button onClick={connect} disabled={!session}>Connect wallet</Button></CardContent></Card> : <div className="grid gap-6 md:grid-cols-2">
          {role === 'Producer' && <Card><CardHeader><Package/><CardTitle>Register a batch</CardTitle><p className="text-sm text-muted-foreground">A unique ID is generated under your producer account.</p></CardHeader><CardContent><form onSubmit={e => void submit(e, 'register_batch')} className="space-y-4"><label className="field">Product name<Input name="product_name" required maxLength={120} placeholder="Mango Sunrise · 250 ml"/></label><label className="field">Metadata URI (optional)<Input name="metadata_uri" placeholder="ipfs://… or https://…" maxLength={512}/></label><label className="field">Metadata SHA-256 (required with URI)<Input name="metadata_sha256" pattern="[a-fA-F0-9]{64}" placeholder="64-character file hash"/></label><p className="text-xs text-muted-foreground">Attaches 0.05 NEAR for storage plus gas. Unused storage deposit is refunded by the contract.</p><Button disabled={signing || Boolean(pending)}>Register with wallet<ArrowRight/></Button></form></CardContent></Card>}
          {(role === 'Producer' || role === 'Distributor') && <Card><CardHeader><Truck/><CardTitle>Transfer custody</CardTitle><p className="text-sm text-muted-foreground">You must currently hold this batch. The recipient must be an approved {role === 'Producer' ? 'distributor' : 'retailer'}.</p></CardHeader><CardContent><form onSubmit={e => void submit(e, 'transfer_custody')} className="space-y-4"><label className="field">Batch ID<Input name="batch_id" required placeholder="producer.testnet:batch-id" defaultValue={batchInput}/></label><label className="field">Recipient NEAR account<Input name="receiver_id" required placeholder={role === 'Producer' ? 'distributor.testnet' : 'retailer.testnet'}/></label><p className="text-xs text-muted-foreground">Attaches 0.05 NEAR for storage plus gas. This records your handoff declaration; recipient acceptance is not part of this version.</p><Button disabled={signing || Boolean(pending)}>Transfer with wallet<ArrowRight/></Button></form></CardContent></Card>}
          {(role === 'Retailer' || role === 'Consumer') && <Card><CardHeader><ShieldCheck/><CardTitle>{role === 'Retailer' ? 'Ready for verification' : 'Consumer / Verifier'}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{role === 'Retailer' ? 'Retail custody is the final stage. Use the verification page to inspect and share your batch passport.' : 'Verification is public. Ask the contract administrator to onboard your account before registering or transferring batches.'}</p><Button className="mt-4" onClick={() => setView('verify')}>Verify a batch</Button></CardContent></Card>}
        </div>}
      </section>}
      <aside className="mt-10 rounded-xl bg-[#edf0e3] p-5 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">What this verifies:</strong> the custody statements recorded by approved accounts, as returned by the API from NEAR. Blockchain records do not prove physical contents, food safety, or that a QR label has not been copied. {config?.network === 'testnet' && 'Testnet is for demonstration; it is not a production assurance.'}</aside>
    </main><footer className="border-t"><div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-8 py-6 text-xs text-muted-foreground"><span>Mixit Smoothies · Know your blend.</span><span className="break-all">{config?.contract_id ?? 'Configure the API to connect to NEAR'}</span></div></footer>
  </div>;
}

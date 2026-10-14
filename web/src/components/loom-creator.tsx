'use client';

import { useState, type FormEvent } from 'react';
import { ArrowUpRight, LoaderCircle, Plus, X } from 'lucide-react';
import { decodeEventLog, parseAbiItem, type Address, type Hex } from 'viem';
import { HUB, HUB_CONFIGURATION_ERROR, MONAD_TESTNET, publicClient, submit } from '../lib/contract';

type Notice = (kind: 'info' | 'success' | 'error', text: string) => void;
type Props = {
  account?: Address;
  chainId?: number;
  onConnect: () => Promise<void>;
  switchChain: () => Promise<void>;
  notify: Notice;
};

const MIN_WINDOW = 60 * 60;
const MAX_WINDOW = 30 * 24 * 60 * 60;
const explorer = 'https://testnet.monadscan.com';
const loomCreatedEvent = parseAbiItem('event LoomCreated(uint256 indexed loomId,address indexed curator,string name)');

export default function LoomCreator({ account, chainId, onConnect, switchChain, notify }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [creatorBps, setCreatorBps] = useState('2000');
  const [curatorBps, setCuratorBps] = useState('1000');
  const [supporterBps, setSupporterBps] = useState('7000');
  const [windowHours, setWindowHours] = useState('24');
  const [pending, setPending] = useState(false);
  const [txHash, setTxHash] = useState<Hex>();
  const [createdLoomId, setCreatedLoomId] = useState<bigint>();
  const [error, setError] = useState('');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setTxHash(undefined);
    setCreatedLoomId(undefined);

    if (!account) {
      await onConnect();
      return;
    }
    if (chainId !== MONAD_TESTNET.id) {
      setError('Switch your wallet to Monad Testnet (chain ID 10143) before creating a Loom.');
      return;
    }
    if (HUB_CONFIGURATION_ERROR || !HUB) {
      setError(HUB_CONFIGURATION_ERROR || 'Live contract actions are disabled until deployment metadata is configured.');
      return;
    }
    const hubAddress = HUB;

    const creatorShare = Number(creatorBps);
    const curatorShare = Number(curatorBps);
    const supporterShare = Number(supporterBps);
    const duration = Number(windowHours) * 60 * 60;
    const encoder = new TextEncoder();
    if (!name.trim() || encoder.encode(name.trim()).length > 280) {
      setError('Enter a Loom name between 1 and 280 UTF-8 bytes.');
      return;
    }
    if (encoder.encode(description).length > 280) {
      setError('Description must be 280 UTF-8 bytes or fewer.');
      return;
    }
    if (!category.trim() || encoder.encode(category.trim()).length > 48) {
      setError('Enter a category between 1 and 48 UTF-8 bytes.');
      return;
    }
    const shares = [creatorShare, curatorShare, supporterShare];
    if (shares.some((share) => !Number.isInteger(share) || share < 0 || share > 10_000) || shares.reduce((sum, share) => sum + share, 0) > 10_000) {
      setError('Enter whole-number basis points from 0 to 10,000; the three allocations may not total over 10,000.');
      return;
    }
    if (!Number.isInteger(duration) || duration < MIN_WINDOW || duration > MAX_WINDOW) {
      setError('Stake window must be between 1 hour and 30 days.');
      return;
    }

    setPending(true);
    notify('info', 'Confirm the Loom creation in your wallet.');
    try {
      const hash = await submit('create-loom', account, {
        name: name.trim(),
        description,
        category: category.trim(),
        creatorBps: creatorShare,
        curatorBps: curatorShare,
        supporterBps: supporterShare,
        stakeWindow: duration,
      });
      setTxHash(hash);
      notify('info', `Loom transaction submitted: ${hash}. Waiting for its receipt.`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error(`Loom creation reverted. Transaction: ${hash}`);
      const eventLog = receipt.logs.find((log) => {
        if (log.address.toLowerCase() !== hubAddress.toLowerCase()) return false;
        try { decodeEventLog({ abi: [loomCreatedEvent], data: log.data, topics: log.topics }); return true; }
        catch { return false; }
      });
      if (eventLog) {
        const event = decodeEventLog({ abi: [loomCreatedEvent], data: eventLog.data, topics: eventLog.topics });
        setCreatedLoomId(event.args.loomId);
      }
      notify('success', `Loom creation confirmed in block ${receipt.blockNumber}.${eventLog ? ` Loom #${decodeEventLog({ abi: [loomCreatedEvent], data: eventLog.data, topics: eventLog.topics }).args.loomId}.` : ''} Transaction: ${hash}`);
      setName('');
      setDescription('');
      setCategory('');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Loom creation failed or was rejected.';
      setError(message);
      notify('error', message);
    } finally {
      setPending(false);
    }
  }

  return <section className="loom-creator" id="loom-creator">
    <button className="loom-create-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <Plus size={15} /> Create a Loom
    </button>
    {open && <div className="loom-create-panel">
      <div className="loom-create-heading">
        <div><h2>Create a Loom</h2><p>Set reward shares and staking window.</p></div>
        <button className="icon-btn" type="button" aria-label="Close Loom form" onClick={() => setOpen(false)} disabled={pending}><X size={17} /></button>
      </div>
      {HUB_CONFIGURATION_ERROR ? <p className="loom-form-error" role="alert">{HUB_CONFIGURATION_ERROR}</p> : !HUB ? <p className="loom-form-hint">Configure the verified Monad Testnet contract to create Looms.</p> : null}
      {!account && <p className="loom-form-hint">Connect an injected wallet to create a Loom. Your wallet will need test MON for transaction gas.</p>}
      {account && chainId !== undefined && chainId !== MONAD_TESTNET.id && <div className="loom-form-hint loom-chain-warning"><span>Wallet is not on Monad Testnet (10143).</span><button type="button" onClick={() => void switchChain()}>Switch network</button></div>}
      <form onSubmit={(event) => void create(event)}>
        <label>Loom name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={280} required placeholder="e.g. Independent Game Audio" /></label>
        <label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={48} required placeholder="e.g. CREATIVE" /></label>
        <label>Description <span>optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={280} rows={3} placeholder="What belongs in this community?" /></label>
        <div className="loom-bps-grid">
          <label>Creator share (BPS)<input type="number" min="0" max="10000" step="1" value={creatorBps} onChange={(event) => setCreatorBps(event.target.value)} required /></label>
          <label>Curator share (BPS)<input type="number" min="0" max="10000" step="1" value={curatorBps} onChange={(event) => setCuratorBps(event.target.value)} required /></label>
          <label>Supporter share (BPS)<input type="number" min="0" max="10000" step="1" value={supporterBps} onChange={(event) => setSupporterBps(event.target.value)} required /></label>
        </div>
        <p className="loom-form-hint">Combined allocation: {Number(creatorBps || 0) + Number(curatorBps || 0) + Number(supporterBps || 0)} / 10,000 BPS. Percentages apply only to funded rewards.</p>
        <label>Stake window (hours)<input type="number" min="1" max="720" step="1" value={windowHours} onChange={(event) => setWindowHours(event.target.value)} required /></label>
        {error && <p className="loom-form-error" role="alert">{error}</p>}
        {txHash && <p className="loom-form-hint">Transaction submitted: <a href={`${explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">{txHash.slice(0, 12)}…{txHash.slice(-6)} <ArrowUpRight size={12} /></a>{pending ? ' · Waiting for receipt confirmation.' : !error ? ` · Receipt confirmed${createdLoomId === undefined ? '' : ` for Loom #${createdLoomId}`}.` : ' · Check the transaction receipt.'}</p>}
        <div className="loom-create-actions">
          {!account ? <button className="loom-submit" type="button" onClick={() => void onConnect()}>Connect wallet</button> : account && chainId !== MONAD_TESTNET.id ? <button className="loom-submit" type="button" onClick={() => void switchChain()}>Switch to Testnet</button> : <button className="loom-submit" type="submit" disabled={pending || !HUB || !!HUB_CONFIGURATION_ERROR}>{pending && <LoaderCircle className="loom-spinner" size={14} />}{pending ? 'Waiting for confirmation…' : 'Create Loom'}</button>}
          <span>Monad Testnet · 10143</span>
        </div>
      </form>
    </div>}
  </section>;
}

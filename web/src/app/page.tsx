'use client';

import { useCallback, useState } from 'react';
import { Compass, ExternalLink, Plus, ShieldCheck, Wallet } from 'lucide-react';
import { type Address } from 'viem';
import EchoLoomLogo from '../components/echoloom-logo';
import LoomCreator from '../components/loom-creator';
import VerifiedFeed from '../components/verified-feed';
import { MONAD_TESTNET } from '../lib/contract';

type Notice = { kind: 'info' | 'success' | 'error'; text: string };
type ActivityItem = { eventName: string; transactionHash: string };

export default function Home() {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [notice, setNotice] = useState<Notice>();
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const updateActivity = useCallback((items: ActivityItem[]) => setRecentActivity(items), []);

  function openPostComposer() {
    setComposerOpen(true);
    if (!account) {
      void connect();
    }
    window.setTimeout(() => document.getElementById('new-post')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  async function connect() {
    try {
      if (!window.ethereum) throw new Error('Install an EVM wallet to connect.');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const id = Number(await window.ethereum.request({ method: 'eth_chainId' }));
      setAccount(accounts[0] as Address);
      setChainId(id);
      window.ethereum.on?.('accountsChanged', (value) => setAccount((value as string[])[0] as Address | undefined));
      window.ethereum.on?.('chainChanged', (value) => {
        const nextChainId = Number(value);
        setChainId(nextChainId);
        setNotice(nextChainId === MONAD_TESTNET.id ? undefined : { kind: 'info', text: 'Switch to Monad Testnet to use on-chain actions.' });
      });
      setNotice(id === MONAD_TESTNET.id ? undefined : { kind: 'info', text: 'Switch to Monad Testnet to use on-chain actions.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Wallet connection failed.' });
    }
  }

  async function switchChain() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x279f' }] });
      setChainId(MONAD_TESTNET.id);
    } catch (error) {
      if ((error as { code?: number }).code !== 4902) {
        setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Network switch failed.' });
        return;
      }
      try {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x279f', chainName: MONAD_TESTNET.name, nativeCurrency: MONAD_TESTNET.nativeCurrency, rpcUrls: ['https://testnet-rpc.monad.xyz'], blockExplorerUrls: ['https://testnet.monadscan.com'] }] });
        setChainId(MONAD_TESTNET.id);
      } catch (addError) {
        setNotice({ kind: 'error', text: addError instanceof Error ? addError.message : 'Could not add Monad Testnet.' });
      }
    }
  }

  return <main className="app-shell">
    <header className="app-header">
      <EchoLoomLogo />
      <a className="header-discover" href="#community-feed"><Compass size={16} /> Discover</a>
      <div className={`network-status ${chainId !== undefined && chainId !== MONAD_TESTNET.id ? 'network-error' : ''}`}>
        <span className="status-dot" />
        {chainId === undefined ? 'Monad Testnet Â· 10143' : chainId === MONAD_TESTNET.id ? 'Connected Â· Monad Testnet' : `Wrong network Â· ${chainId}`}
        {chainId !== undefined && chainId !== MONAD_TESTNET.id && <button onClick={() => void switchChain()}>Switch</button>}
      </div>
      {account ? <button className="wallet-button connected" onClick={() => { setAccount(undefined); setChainId(undefined); }} title="Disconnect wallet">{account.slice(0, 6)}â€¦{account.slice(-4)}</button> : <button className="wallet-button" onClick={() => void connect()}><Wallet size={16} /> Connect wallet</button>}
    </header>

    {notice && <div className={`app-notice ${notice.kind}`} role="status"><span>{notice.text}</span><button onClick={() => setNotice(undefined)} aria-label="Dismiss notification">Ã—</button></div>}

    <div className="social-layout" id="top">
      <aside className="left-rail" aria-label="Main navigation">
        <a className="rail-link rail-current" href="#community-feed"><Compass size={18} /> Community</a>
        <div className="rail-divider" />
        <p className="rail-caption">Communities</p>
        <a className="rail-link rail-community-link" href="#verified-feed">All Looms</a>
        <LoomCreator account={account} chainId={chainId} onConnect={connect} switchChain={switchChain} notify={(kind, text) => setNotice({ kind, text })} />
      </aside>
      <section className="feed-column" id="community-feed">
        <section className="page-intro"><div><p className="page-kicker">COMMUNITY</p><h1>Community feed</h1><p>Latest posts from active Looms.</p></div><button className="primary-button feed-create-button" onClick={openPostComposer}><Plus size={17} /> Create a post</button></section>
        <VerifiedFeed account={account} chainId={chainId} notify={(kind, text) => setNotice({ kind, text })} switchChain={switchChain} onActivity={updateActivity} composerOpen={composerOpen} />
      </section>
      <aside className="right-rail" aria-label="Network and community details">
        <section className="rail-card activity-card">
          <p className="rail-card-kicker">CONFIRMED ON-CHAIN</p>
          <h2>Recent activity</h2>
          {recentActivity.length ? <div className="rail-activity-list">{recentActivity.map((item, index) => <a key={`${item.transactionHash}-${index}`} href={`https://testnet.monadscan.com/tx/${item.transactionHash}`} target="_blank" rel="noreferrer"><span>{item.eventName}</span><small>{item.transactionHash.slice(0, 10)}â€¦</small></a>)}</div> : <p>Confirmed Loom and post activity will appear here.</p>}
          <div className="rail-card-meta"><span className={`status-dot ${chainId !== undefined && chainId !== MONAD_TESTNET.id ? 'status-dot-error' : ''}`} />Monad Testnet Â· 10143</div>
          <a className="rail-explorer-link" href="https://testnet.monadscan.com" target="_blank" rel="noreferrer">Monad Explorer <ExternalLink size={13} /></a>
        </section>
        <p className="rail-footnote"><ShieldCheck size={14} /> Every activity link opens its confirmed transaction.</p>
      </aside>
    </div>
    <footer className="app-footer"><a href="https://testnet.monadscan.com" target="_blank" rel="noreferrer">Monad Explorer</a><span>Â·</span><a href="https://docs.monad.xyz" target="_blank" rel="noreferrer">Monad docs</a></footer>

  </main>;
}



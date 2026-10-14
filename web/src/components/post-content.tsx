'use client';

import { useEffect, useState } from 'react';
import { isValidIpfsCid } from '../lib/content-reference';

type LoadedContent = { type: 'image'; url: string } | { type: 'text'; text: string } | { type: 'error' } | { type: 'loading' };

export default function PostContent({ uri, hash, author }: { uri: string; hash: string; author: string }) {
  const cid = uri.startsWith('ipfs://') ? uri.slice(7) : '';
  const [content, setContent] = useState<LoadedContent>({ type: 'loading' });

  useEffect(() => {
    if (!isValidIpfsCid(cid) || !/^0x[0-9a-fA-F]{64}$/.test(hash)) { setContent({ type: 'error' }); return; }
    let objectUrl = '';
    const controller = new AbortController();
    void fetch(`/api/content/ipfs/${encodeURIComponent(cid)}?hash=${encodeURIComponent(hash)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok || response.headers.get('x-echoloom-hash-verified') !== 'true') throw new Error('Content could not be verified.');
        const type = response.headers.get('content-type')?.split(';', 1)[0] || '';
        if (type.startsWith('image/')) { objectUrl = URL.createObjectURL(await response.blob()); return { type: 'image', url: objectUrl } as const; }
        if (type === 'text/plain' || type === 'text/markdown') return { type: 'text', text: new TextDecoder('utf-8', { fatal: true }).decode(await response.arrayBuffer()) } as const;
        throw new Error('Unsupported content type.');
      })
      .then(setContent)
      .catch(() => { if (!controller.signal.aborted) setContent({ type: 'error' }); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [cid, hash]);

  if (content.type === 'image') return <figure className="post-attachment"><img src={content.url} alt={`Post by ${author}`} loading="lazy" /></figure>;
  if (content.type === 'text') return <div className="post-attachment post-text-content">{content.text}</div>;
  if (content.type === 'loading') return <div className="post-attachment post-content-loading">Loading post…</div>;
  const fallback = isValidIpfsCid(cid) ? `https://gateway.pinata.cloud/ipfs/${cid}` : uri;
  return <div className="post-attachment post-content-fallback">Content could not be verified or loaded. <a href={fallback} target="_blank" rel="noreferrer">Open content</a></div>;
}

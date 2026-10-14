'use client';

import { useEffect, useState } from 'react';
import { isValidIpfsCid } from '../lib/content-reference';

type LoadedContent = { type: 'image'; url: string } | { type: 'text'; text: string } | { type: 'error' } | { type: 'loading' };

export default function PostContent({ uri, hash, author }: { uri: string; hash: string; author: string }) {
  const cid = uri.startsWith('ipfs://') ? uri.slice(7) : '';
  const digest = /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash.slice(2).toLowerCase() : '';
  const [content, setContent] = useState<LoadedContent>({ type: 'loading' });

  useEffect(() => {
    let endpoint = '';
    let ipfs = false;
    if (isValidIpfsCid(cid)) {
      endpoint = `/api/content/ipfs/${encodeURIComponent(cid)}?hash=${encodeURIComponent(hash)}`;
      ipfs = true;
    } else {
      // Supabase public URLs contain the SHA-256 digest as their final path segment.
      // Load by digest through our server API so the service role key stays private.
      try {
        const url = new URL(uri);
        const segments = url.pathname.split('/').filter(Boolean);
        const isPublicStorageUrl = segments.join('/').includes('storage/v1/object/public/');
        if (url.protocol === 'https:' && isPublicStorageUrl && segments.at(-1)?.toLowerCase() === digest && digest) {
          endpoint = `/api/content/${digest}`;
        }
      } catch { /* Invalid references are shown with the ordinary fallback link. */ }
    }
    if (!endpoint) { setContent({ type: 'error' }); return; }
    let objectUrl = '';
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal })
      .then(async response => {
        const verified = ipfs
          ? response.headers.get('x-echoloom-hash-verified') === 'true'
          : response.headers.get('x-content-sha256')?.toLowerCase() === hash.toLowerCase();
        if (!response.ok || !verified) throw new Error('Content could not be verified.');
        const type = response.headers.get('content-type')?.split(';', 1)[0] || '';
        if (type.startsWith('image/')) { objectUrl = URL.createObjectURL(await response.blob()); return { type: 'image', url: objectUrl } as const; }
        if (type === 'text/plain' || type === 'text/markdown') return { type: 'text', text: new TextDecoder('utf-8', { fatal: true }).decode(await response.arrayBuffer()) } as const;
        throw new Error('Unsupported content type.');
      })
      .then(setContent)
      .catch(() => { if (!controller.signal.aborted) setContent({ type: 'error' }); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [cid, digest, hash, uri]);

  if (content.type === 'image') return <figure className="post-attachment"><img src={content.url} alt={`Post by ${author}`} loading="lazy" /></figure>;
  if (content.type === 'text') return <div className="post-attachment post-text-content">{content.text}</div>;
  if (content.type === 'loading') return <div className="post-attachment post-content-loading">Loading post…</div>;
  const fallback = isValidIpfsCid(cid) ? `https://gateway.pinata.cloud/ipfs/${cid}` : uri;
  return <div className="post-attachment post-content-fallback">Content could not be verified or loaded. <a href={fallback} target="_blank" rel="noreferrer">Open content</a></div>;
}

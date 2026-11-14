// Demo video for an exercise or fight lesson. Loads only when tapped (saves data,
// and nothing is fetched from YouTube/TikTok until the person asks to watch).
// With no video yet, shows a quiet "coming soon" slot with a way to preview a
// link on this phone.

import React, { useState } from 'react';
import { parseVideo, setLocalVideo, videoFor } from '../lib/video';
import { useToast } from './core';

export function VideoDemo({ id, title, compact = false }: { id: string; title: string; compact?: boolean }) {
  const toast = useToast();
  const [ver, setVer] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState('');
  const found = videoFor(id); // re-read when ver changes
  void ver;

  if (!found) {
    if (compact) return null;
    return (
      <div className="vdemo vdemo-empty" data-testid={`video-empty-${id}`}>
        <span className="small muted">Demo video coming soon.</span>
        {!adding
          ? <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)} data-testid="video-add">Preview a link</button>
          : (
            <form className="stack" style={{ gap: 8, width: '100%' }} onSubmit={(e) => { e.preventDefault(); if (!parseVideo(link)) { toast('Paste a YouTube, TikTok, Instagram Reel or Vimeo link'); return; } setLocalVideo(id, link); setAdding(false); setLink(''); setVer(ver + 1); setPlaying(true); }}>
              <input className="input" inputMode="url" placeholder="YouTube, TikTok, Reel or Vimeo link" aria-label={`Video link for ${title}`} value={link} onChange={(e) => setLink(e.target.value)} data-testid="video-link" />
              <p className="small muted" style={{ margin: 0 }}>Plays on this phone only, to check it looks right. Send the link to Atom to publish it for everyone.</p>
              <div className="row"><button className="btn btn-primary btn-sm" type="submit" data-testid="video-save">Preview</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button></div>
            </form>
          )}
      </div>
    );
  }

  const { video: v, local } = found;
  return (
    <div className={'vdemo' + (v.vertical ? ' vertical' : '')} data-testid={`video-${id}`} data-kind={v.kind}>
      {playing ? (
        v.kind === 'file'
          ? <video className="vdemo-frame" src={v.embed} controls playsInline autoPlay muted loop aria-label={`${title} demo`} />
          : <iframe className="vdemo-frame" src={v.embed + (v.kind === 'youtube' ? '&autoplay=1' : '')} title={`${title} demo`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
      ) : (
        <button className="vdemo-poster" onClick={() => setPlaying(true)} aria-label={`Play ${title} demo video`} data-testid="video-play" style={v.poster ? { backgroundImage: `url(${v.poster})` } : undefined}>
          <span className="vdemo-play" aria-hidden><svg viewBox="0 0 24 24" width="26" height="26"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
          <span className="vdemo-label">Watch demo</span>
        </button>
      )}
      {local && <div className="row-between small" style={{ marginTop: 6 }}><span className="muted">Preview on this phone only</span><button className="link-quiet small" onClick={() => { setLocalVideo(id, null); setPlaying(false); setVer(ver + 1); }} data-testid="video-remove">Remove</button></div>}
    </div>
  );
}

/** Small marker next to an exercise name when it has a video. */
export const hasVideo = (id: string) => !!videoFor(id);

// Demo videos: turn a link the coach sends (YouTube, Shorts, TikTok, Instagram
// Reel, Vimeo or a video file) into something the app can play inline.

import { VIDEOS } from '../content/videos';

export type VideoKind = 'youtube' | 'vimeo' | 'tiktok' | 'instagram' | 'file';
export interface ParsedVideo { kind: VideoKind; embed: string; poster?: string; vertical: boolean; source: string }

export function parseVideo(raw: string): ParsedVideo | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\/?[\w\-/]+\.(mp4|webm|mov)$/i.test(s) || /^https:\/\/[^\s]+\.(mp4|webm|mov)(\?.*)?$/i.test(s)) return { kind: 'file', embed: s, vertical: false, source: s };
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const startOf = () => { const t = u.searchParams.get('t') ?? u.searchParams.get('start'); if (!t) return 0; const m = t.match(/^(?:(\d+)m)?(\d+)s?$/); return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : 0; };
  const yt = (id: string, vertical: boolean) => {
    if (!/^[\w-]{11}$/.test(id)) return null;
    const st = startOf();
    return { kind: 'youtube' as const, embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1${st ? `&start=${st}` : ''}`, poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, vertical, source: s };
  };
  if (host === 'youtu.be') return yt(u.pathname.slice(1), false);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const p = u.pathname.split('/').filter(Boolean);
    if (p[0] === 'watch') return yt(u.searchParams.get('v') ?? '', false);
    if (p[0] === 'shorts') return yt(p[1] ?? '', true);
    if (p[0] === 'embed' || p[0] === 'live') return yt(p[1] ?? '', false);
    return null;
  }
  if (host === 'vimeo.com') { const id = u.pathname.split('/').filter(Boolean)[0]; return /^\d+$/.test(id ?? '') ? { kind: 'vimeo', embed: `https://player.vimeo.com/video/${id}?dnt=1`, vertical: false, source: s } : null; }
  if (host === 'player.vimeo.com') { const id = u.pathname.split('/').filter(Boolean)[1]; return /^\d+$/.test(id ?? '') ? { kind: 'vimeo', embed: `https://player.vimeo.com/video/${id}?dnt=1`, vertical: false, source: s } : null; }
  if (host === 'tiktok.com') { const m = u.pathname.match(/\/video\/(\d+)/); return m ? { kind: 'tiktok', embed: `https://www.tiktok.com/embed/v2/${m[1]}`, vertical: true, source: s } : null; }
  if (host === 'instagram.com') { const m = u.pathname.match(/^\/(?:reel|reels|p)\/([\w-]+)/); return m ? { kind: 'instagram', embed: `https://www.instagram.com/reel/${m[1]}/embed`, vertical: true, source: s } : null; }
  return null;
}

// Links added on this phone to preview before they're published for everyone.
const LOCAL = 'px:videos';
export function localVideos(): Record<string, string> { try { return JSON.parse(localStorage.getItem(LOCAL) ?? '{}'); } catch { return {}; } }
export function setLocalVideo(id: string, url: string | null) {
  const v = localVideos();
  if (url) v[id] = url; else delete v[id];
  try { localStorage.setItem(LOCAL, JSON.stringify(v)); } catch { /* ignore */ }
}
export function videoFor(id: string): { video: ParsedVideo; local: boolean } | null {
  const l = localVideos()[id];
  if (l) { const v = parseVideo(l); if (v) return { video: v, local: true }; }
  const p = VIDEOS[id] ? parseVideo(VIDEOS[id]) : null;
  return p ? { video: p, local: false } : null;
}

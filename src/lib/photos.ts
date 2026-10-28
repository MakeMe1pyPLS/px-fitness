// Progress photos (from PX). Kept in their own storage key so the main data
// document stays small and fast to save. Photos never leave the device.
import type { ProgressPhoto } from './types';
import type { StorageLike } from './store';
import { uid } from './dates';

export const PHOTO_KEY = 'px:photos';
export const MAX_PHOTOS = 24;
export const MAX_TOTAL_BYTES = 3_000_000; // stay well inside typical 5 MB browser storage

function storage(): StorageLike | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export class PhotoStore {
  private mem: ProgressPhoto[] = [];
  constructor(private s: StorageLike | null = storage()) {
    try { this.mem = JSON.parse(this.s?.getItem(PHOTO_KEY) ?? '[]'); } catch { this.mem = []; }
  }
  list() { return [...this.mem].sort((a, b) => b.date.localeCompare(a.date)); }
  totalBytes() { return this.mem.reduce((n, p) => n + p.bytes, 0); }
  canAdd(bytes: number): string | null {
    if (this.mem.length >= MAX_PHOTOS) return `You can keep up to ${MAX_PHOTOS} photos on this device. Delete an older one first.`;
    if (this.totalBytes() + bytes > MAX_TOTAL_BYTES) return 'Photo storage on this device is full. Delete an older photo first.';
    return null;
  }
  add(date: string, dataUrl: string, note?: string): ProgressPhoto {
    const bytes = Math.round((dataUrl.length * 3) / 4);
    const err = this.canAdd(bytes);
    if (err) throw new Error(err);
    const p: ProgressPhoto = { id: uid('ph_'), date, dataUrl, note, bytes };
    const next = [...this.mem, p];
    try { this.s?.setItem(PHOTO_KEY, JSON.stringify(next)); } catch { throw new Error('This browser couldn’t save the photo (storage is full or blocked).'); }
    this.mem = next;
    return p;
  }
  remove(id: string) {
    this.mem = this.mem.filter((p) => p.id !== id);
    try { this.s?.setItem(PHOTO_KEY, JSON.stringify(this.mem)); } catch { /* ignore */ }
  }
  clear() { this.mem = []; try { this.s?.removeItem(PHOTO_KEY); } catch { /* ignore */ } }
}

/** Auto milestones derived from the log, never stored, so they can't drift. */
export function autoMilestones(sessionsCompleted: { plannedFor: string }[], prCount: number, checkins: number) {
  const out: { title: string; date?: string }[] = [];
  const sorted = [...sessionsCompleted].sort((a, b) => a.plannedFor.localeCompare(b.plannedFor));
  for (const n of [1, 10, 25, 50, 100]) if (sorted.length >= n) out.push({ title: n === 1 ? 'First workout logged' : `${n} workouts logged`, date: sorted[n - 1].plannedFor });
  if (prCount >= 1) out.push({ title: `${prCount} personal best${prCount > 1 ? 's' : ''} set` });
  if (checkins >= 7) out.push({ title: `${checkins} check-ins completed` });
  return out;
}

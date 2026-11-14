import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVideo } from '../src/lib/video';

test('YouTube links of every shape', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [`https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`, `https://m.youtube.com/watch?v=${id}&t=1m5s`, `https://www.youtube.com/embed/${id}`]) {
    const v = parseVideo(u)!; assert.equal(v.kind, 'youtube'); assert.match(v.embed, new RegExp(`youtube-nocookie.com/embed/${id}`)); assert.equal(v.vertical, false);
  }
  assert.match(parseVideo(`https://m.youtube.com/watch?v=${id}&t=1m5s`)!.embed, /start=65/);
  const s = parseVideo(`https://youtube.com/shorts/${id}?feature=share`)!; assert.equal(s.vertical, true);
  assert.equal(parseVideo('https://youtube.com/watch?v=short'), null);
});
test('TikTok, Instagram, Vimeo and files', () => {
  assert.equal(parseVideo('https://www.tiktok.com/@pxfitnessltd/video/7301234567890123456')!.embed, 'https://www.tiktok.com/embed/v2/7301234567890123456');
  assert.equal(parseVideo('https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=x')!.embed, 'https://www.instagram.com/reel/C1a2B3c4D5e/embed');
  assert.equal(parseVideo('https://vimeo.com/123456789')!.embed, 'https://player.vimeo.com/video/123456789?dnt=1');
  assert.equal(parseVideo('https://cdn.example.com/clips/jab.mp4')!.kind, 'file');
});
test('rejects junk and non-https', () => {
  for (const u of ['', 'hello', 'http://youtube.com/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'https://evil.example.com/watch?v=dQw4w9WgXcQ', 'https://www.tiktok.com/@x']) assert.equal(parseVideo(u), null, u);
});

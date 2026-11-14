import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFeelings, summarize, noteAdvice, exerciseLoads, feelingTrends } from '../src/lib/feelings';

const kinds = (t: string) => summarize(extractFeelings(t)).map((f) => f.kind + (f.part ? ':' + f.part : ''));

test('picks up feelings and body parts', () => {
  assert.deepEqual(kinds('Felt strong but my left knee was sore on lunges'), ['good', 'sore:knee']);
  assert.deepEqual(kinds('Shoulder pain on the press, pretty tired'), ['pain:shoulder', 'tired']);
  assert.deepEqual(kinds('way too easy today'), ['easy']);
  assert.deepEqual(kinds('Brutal session. Stressed from work'), ['hard', 'low']);
});
test('skips negated words', () => {
  assert.deepEqual(kinds('not tired at all, no knee pain'), []);
  assert.deepEqual(kinds("didn't hurt, felt great"), ['good']);
});
test('positions are exact for highlighting', () => {
  const t = 'I was exhausted';
  const [f] = extractFeelings(t);
  assert.equal(t.slice(f.start, f.end), 'exhausted');
});
test('exercise mapping', () => {
  assert.ok(exerciseLoads('split-squat', 'knee'));
  assert.ok(exerciseLoads('db-ohp', 'shoulder'));
  assert.ok(!exerciseLoads('plank', 'knee'));
});

const day = (n: number) => { const d = new Date('2026-11-14T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString(); };
const ses = (note: string, at: number) => ({ id: 's' + at, templateId: null, name: 'Leg Day', variant: 'full', plannedFor: day(at).slice(0, 10), startedAt: day(at), endedAt: day(at), status: 'completed', exercises: [], note, feelings: summarize(extractFeelings(note)) });
const data = (s: unknown[]) => ({ sessions: s, customExercises: [] }) as never;

test('advice for the next workout', () => {
  const a = noteAdvice(data([ses('knee hurts after squats', -1)]), '2026-11-14')!;
  assert.match(a.headline, /knee/); assert.deepEqual(a.cautionParts, ['knee']); assert.equal(a.suggestShort, false);
  assert.equal(noteAdvice(data([ses('so tired', -1)]), '2026-11-14')!.suggestShort, true);
  assert.equal(noteAdvice(data([ses('too easy', -1)]), '2026-11-14')!.pushHarder, true);
  assert.equal(noteAdvice(data([ses('too easy', -6)]), '2026-11-14'), null, 'old notes expire');
  assert.match(noteAdvice(data([ses('so tired', -3), ses('felt great', -1)]), '2026-11-14')!.headline, /Keep that going/, 'latest note wins');
});
test('trends count over 30 days', () => {
  const t = feelingTrends(data([ses('tired', -1), ses('tired, knee sore', -2), ses('tired', -40)]).sessions as never, '2026-11-14');
  assert.deepEqual(t.map((x) => `${x.label}:${x.count}`), ['Tired:2', 'Knee sore:1']);
});

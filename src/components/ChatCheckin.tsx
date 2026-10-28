import React, { useEffect, useRef, useState } from 'react';
import { Icon, Portal, store, useData, type Route } from './core';
import { QUESTIONS, SAFETY_REPLY, detectSafety, greeting, nextStep, parseFreeText, recall, summarize, type Patch, type StepId } from '../lib/checkinBot';
import { toDateKey } from '../lib/dates';

interface Msg { from: 'bot' | 'me'; text: string; tone?: 'safety' }

const STEP_FIELD: Partial<Record<StepId, keyof Patch>> = { mood: 'mood', energy: 'energy', sleep: 'sleepHours', time: 'availableMinutes' };

export function ChatCheckin({ onClose, go, initialMood }: { onClose: () => void; go: (r: Route) => void; initialMood?: { label: string; value: number } }) {
  const data = useData();
  const date = toDateKey(new Date());
  const existing = data.checkins.find((c) => c.date === date);
  const [answers, setAnswers] = useState<Patch>(() => (initialMood ? { mood: initialMood.value } : {}));
  const [asked, setAsked] = useState<StepId[]>(() => (initialMood ? ['mood'] : []));
  const [step, setStep] = useState<StepId | null>(initialMood ? 'energy' : 'mood');
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    const r = recall(data);
    const open: Msg[] = [{ from: 'bot', text: greeting(data) }, ...(r ? [{ from: 'bot' as const, text: r }] : []), { from: 'bot', text: QUESTIONS.mood.text }];
    return initialMood ? [...open, { from: 'me', text: initialMood.label }, { from: 'bot', text: QUESTIONS.energy.text }] : open;
  });
  const [text, setText] = useState('');
  const [stopped, setStopped] = useState(false);
  const [done, setDone] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [msgs]);
  useEffect(() => {
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => { document.body.style.overflow = o; window.removeEventListener('keydown', k); };
  }, [onClose]);

  const advance = (nextAnswers: Patch, nextAsked: StepId[], said: Msg[]) => {
    // Save as we go, so leaving halfway still keeps what was answered.
    if (Object.keys(nextAnswers).length) store.saveCheckin(date, nextAnswers);
    const n = nextStep(nextAnswers, nextAsked);
    if (n) {
      setStep(n);
      setMsgs((m) => [...m, ...said, { from: 'bot', text: QUESTIONS[n].text }]);
    } else {
      setStep(null);
      setDone(true);
      const sum = summarize(data, nextAnswers);
      setMsgs((m) => [...m, ...said, { from: 'bot', text: sum.lines.length ? `Got it: ${sum.lines.join(', ')}. ${sum.suggestion}` : sum.suggestion }]);
    }
  };

  const pick = (label: string, patch: Patch, skip?: boolean) => {
    if (!step || stopped) return;
    const a = { ...answers, ...patch };
    const asked2 = [...asked, step];
    setAnswers(a);
    setAsked(asked2);
    advance(a, asked2, [{ from: 'me', text: label }]);
    void skip;
  };

  const send = () => {
    const t = text.trim();
    if (!t || !step || stopped) return;
    setText('');
    const safety = detectSafety(t);
    if (safety === 'crisis') {
      // Stop the check-in. Don't save this message anywhere.
      setStopped(true);
      setStep(null);
      setMsgs((m) => [...m, { from: 'me', text: t }, { from: 'bot', text: SAFETY_REPLY.crisis, tone: 'safety' }]);
      return;
    }
    const parsed = parseFreeText(t);
    // Free text only fills fields that weren't answered yet, plus the one being asked.
    const field = STEP_FIELD[step];
    const a: Patch = { ...answers };
    for (const [k, v] of Object.entries(parsed) as [keyof Patch, number][]) if (a[k] === undefined || k === field) (a as Record<string, unknown>)[k] = v;
    if (safety === 'pain') a.soreness = Math.max(a.soreness ?? 0, 4);
    const asked2 = [...asked, step];
    setAnswers(a);
    setAsked(asked2);
    const said: Msg[] = [{ from: 'me', text: t }];
    if (safety) said.push({ from: 'bot', text: SAFETY_REPLY[safety], tone: 'safety' });
    // Remember what the user said in their own words (not for safety-flagged eating messages).
    // Only things the structured fields didn't capture are worth remembering.
    if (safety !== 'ed' && (step === 'note' || step === 'body' || Object.keys(parsed).length === 0)) store.remember(date, t);
    if (step === 'note') store.saveCheckin(date, { note: [existing?.note, t].filter(Boolean).join(' · ') });
    advance(a, asked2, said);
  };

  const q = step ? QUESTIONS[step] : null;
  return (
    <Portal>
    <div className="chat" role="dialog" aria-modal="true" aria-label="Daily check-in">
      <header className="chat-head">
        <button className="icon-btn" aria-label="Close check-in" onClick={onClose}><Icon.close /></button>
        <div style={{ textAlign: 'center' }}><b>Check-in</b><div className="small muted">Saved as you go · on this device</div></div>
        <span style={{ width: 44 }} />
      </header>
      <div className="chat-log" role="log" aria-live="polite">
        {msgs.map((m, i) => <div key={i} className={'bubble ' + m.from + (m.tone ? ' ' + m.tone : '')}>{m.text}</div>)}
        {q?.hint && !stopped && <div className="small muted chat-hint">{q.hint}</div>}
        {done && (
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            {summarize(data, answers).short && <button className="btn btn-primary" onClick={() => { onClose(); go('home'); }} data-testid="chat-go-today">See today’s short version</button>}
            <button className="btn btn-outline" onClick={onClose} data-testid="chat-done">Done</button>
          </div>
        )}
        {stopped && <button className="btn btn-outline" onClick={onClose} style={{ marginTop: 8 }}>Close</button>}
        <div ref={endRef} />
      </div>
      {q && !stopped && (
        <footer className="chat-input">
          <div className="chips chat-chips">
            {q.chips.map((c) => <button key={c.label} className="chip" onClick={() => pick(c.label, c.patch, c.skip)} data-testid={`chip-${c.label}`}>{c.label}</button>)}
            {step !== 'note' && <button className="chip chip-ghost" onClick={() => pick('Skip', {}, true)}>Skip</button>}
          </div>
          <form className="row" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input ref={inputRef} className="input grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type: “tired, slept 6h, 20 min free”" aria-label="Type your answer" data-testid="chat-text" maxLength={300} />
            <button className="btn btn-primary" disabled={!text.trim()} aria-label="Send" data-testid="chat-send"><Icon.arrow /></button>
          </form>
          <p className="small muted" style={{ marginTop: 6 }}>Scripted assistant: it reads simple phrases, not everything. Not medical advice.</p>
        </footer>
      )}
    </div>
    </Portal>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { Icon, Portal, cloud, store, useCloud, useData, type Route } from './core';
import { CloudError, isActive } from '../lib/cloud';
import { nextTemplate, isTrainingDay } from '../lib/planner';
import { QUESTIONS, SAFETY_REPLY, detectSafety, greeting, nextStep, parseFreeText, recall, summarize, type Patch, type StepId } from '../lib/checkinBot';
import { toDateKey } from '../lib/dates';

interface Msg { from: 'bot' | 'me'; text: string; tone?: 'safety'; local?: boolean }

const STEP_FIELD: Partial<Record<StepId, keyof Patch>> = { mood: 'mood', energy: 'energy', sleep: 'sleepHours', time: 'availableMinutes' };

type Props = { onClose: () => void; go: (r: Route) => void; initialMood?: { label: string; value: number } };

/** Subscribers get the AI coach; everyone else (and any AI failure) gets the scripted check-in. */
export function ChatCheckin(props: Props) {
  const c = useCloud();
  const [fallback, setFallback] = useState<string | null>(null);
  const ai = c.enabled && !!c.session && isActive(c.sub) && fallback === null;
  return ai ? <AiChat {...props} onFallback={setFallback} /> : <ScriptedChat {...props} notice={fallback} />;
}

const AI_FIELDS = ['mood', 'energy', 'stress', 'soreness', 'sleepHours', 'availableMinutes'] as const;

function AiChat({ onClose, go, initialMood, onFallback }: Props & { onFallback: (why: string) => void }) {
  const data = useData();
  const date = toDateKey(new Date());
  const opener = QUESTIONS.mood.text;
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    const r = recall(data);
    return [{ from: 'bot', text: greeting(data), local: true }, ...(r ? [{ from: 'bot' as const, text: r, local: true }] : []), { from: 'bot', text: opener, local: true }];
  });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [answers, setAnswers] = useState<Patch>({});
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [msgs]);
  useEffect(() => {
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => { document.body.style.overflow = o; window.removeEventListener('keydown', k); };
  }, [onClose]);

  const today = () => {
    if (!data.profile || !isTrainingDay(data.profile, date)) return 'rest day';
    return nextTemplate(data)?.name ?? 'training day';
  };

  const ask = async (history: Msg[]) => {
    // Only the person's words and the coach's real replies go to the server; on-device notes stay here.
    const convo = history.filter((m) => !m.local).map((m) => ({ role: m.from === 'me' ? ('user' as const) : ('assistant' as const), content: m.text }));
    while (convo.length && convo[0].role === 'assistant') convo.shift();
    if (!convo.length) return;
    setBusy(true);
    try {
      const r = await cloud.aiCheckin(convo, { name: data.profile?.name ?? '', recall: recall(data) ?? '', todaySession: today(), opener });
      const patch: Patch = {};
      if (r.checkin) for (const k of AI_FIELDS) if (typeof r.checkin[k] === 'number') (patch as Record<string, number>)[k] = r.checkin[k] as number;
      if (Object.keys(patch).length) { store.saveCheckin(date, patch); setAnswers((a) => ({ ...a, ...patch })); }
      if (typeof r.checkin?.remember === 'string' && r.checkin.remember.trim()) store.remember(date, r.checkin.remember.trim().slice(0, 200));
      setMsgs((m) => [...m, { from: 'bot', text: r.reply || (r.done ? 'Saved. Have a good one.' : 'Got it.') }]);
      if (r.done) setDone(true);
    } catch (e) {
      const code = e instanceof CloudError ? e.code : '';
      const why = code === 'daily_limit' ? 'You’ve used today’s AI coach messages. Switching to the quick check-in.' : code === 'not_subscribed' ? 'PX Plus isn’t active on this account, so here’s the quick check-in.' : 'The AI coach isn’t available right now, so here’s the quick check-in.';
      if (code === 'not_subscribed') void cloud.refreshSub();
      onFallback(why);
    }
    setBusy(false);
  };

  useEffect(() => {
    if (!initialMood || started.current) return;
    started.current = true;
    store.saveCheckin(date, { mood: initialMood.value });
    const next: Msg[] = [...msgs, { from: 'me', text: initialMood.label }];
    setMsgs(next);
    void ask(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = () => {
    const t = text.trim();
    if (!t || busy || stopped) return;
    setText('');
    const safety = detectSafety(t);
    if (safety === 'crisis') {
      // Never sent to the server or saved.
      setStopped(true);
      setMsgs((m) => [...m, { from: 'me', text: t, local: true }, { from: 'bot', text: SAFETY_REPLY.crisis, tone: 'safety', local: true }]);
      return;
    }
    if (safety === 'ed') {
      setMsgs((m) => [...m, { from: 'me', text: t, local: true }, { from: 'bot', text: SAFETY_REPLY.ed, tone: 'safety', local: true }]);
      return;
    }
    const mine: Msg = { from: 'me', text: t };
    const next = [...msgs, mine, ...(safety === 'pain' ? [{ from: 'bot' as const, text: SAFETY_REPLY.pain, tone: 'safety' as const, local: true }] : [])];
    if (safety === 'pain') store.saveCheckin(date, { soreness: 4 });
    setMsgs(next);
    void ask(next);
  };

  const sum = summarize(data, answers);
  return (
    <Portal>
    <div className="chat" role="dialog" aria-modal="true" aria-label="Daily check-in with AI coach" data-testid="ai-chat">
      <header className="chat-head">
        <button className="icon-btn" aria-label="Close check-in" onClick={onClose}><Icon.close /></button>
        <div style={{ textAlign: 'center' }}><b>AI coach</b><div className="small muted">PX Plus · saved as you go</div></div>
        <span style={{ width: 44 }} />
      </header>
      <div className="chat-log" role="log" aria-live="polite">
        {msgs.map((m, i) => <div key={i} className={'bubble ' + m.from + (m.tone ? ' ' + m.tone : '')}>{m.text}</div>)}
        {busy && <div className="bubble bot typing" aria-label="Coach is typing"><span /><span /><span /></div>}
        {done && (
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            {sum.short && <button className="btn btn-primary" onClick={() => { onClose(); go('home'); }} data-testid="chat-go-today">See today’s short version</button>}
            <button className="btn btn-outline" onClick={onClose} data-testid="chat-done">Done</button>
          </div>
        )}
        {stopped && <button className="btn btn-outline" onClick={onClose} style={{ marginTop: 8 }}>Close</button>}
        <div ref={endRef} />
      </div>
      {!stopped && !done && (
        <footer className="chat-input">
          <form className="row" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell me how you’re doing…" aria-label="Message the AI coach" data-testid="chat-text" maxLength={500} disabled={busy} />
            <button className="btn btn-primary" disabled={!text.trim() || busy} aria-label="Send" data-testid="chat-send"><Icon.arrow /></button>
          </form>
          <p className="small muted" style={{ marginTop: 6 }}>AI coach, not a doctor. Not medical advice.</p>
        </footer>
      )}
    </div>
    </Portal>
  );
}

function ScriptedChat({ onClose, go, initialMood, notice }: Props & { notice?: string | null }) {
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
        {notice && <div className="small muted chat-hint" role="status" data-testid="ai-fallback">{notice}</div>}
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

"use client";

import { CSSProperties, KeyboardEvent, PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/domain/library";
import { SpeechSettingsPanel } from "@/features/speech/SpeechSettings";
import { useSpeechVoices } from "@/features/speech/useSpeechVoices";
import { SpeechRate, SpeechSettings, cancelSpeech, defaultSpeechSettings, readSpeechSettings, saveSpeechSettings, speakEnglish } from "@/lib/speech";

type Result = "correct" | "incorrect";
type Phase = "setup" | "study" | "result";

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
};

export function StudySession({ cards, setName, onExit }: { cards: Card[]; setName: string; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [delay, setDelay] = useState(2000);
  const [random, setRandom] = useState(false);
  const [audio, setAudio] = useState(true);
  const [speechSettings, setSpeechSettings] = useState<SpeechSettings>(defaultSpeechSettings);
  const [speechSettingsReady, setSpeechSettingsReady] = useState(false);
  const [queue, setQueue] = useState<Card[]>([]);
  const [round, setRound] = useState(1);
  const [roundSize, setRoundSize] = useState(0);
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [initialIncorrect, setInitialIncorrect] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [finishedAt, setFinishedAt] = useState(0);
  const [swipeX, setSwipeX] = useState(0);
  const pointerStart = useRef<number | null>(null);
  const lastAutoSpeechKey = useRef("");
  const current = queue[position];
  const { voices, loaded: voicesLoaded, supported: speechSupported } = useSpeechVoices();

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("instant-vocabulary-settings");
      if (saved) {
        const value = JSON.parse(saved) as { delay?: number; random?: boolean; audio?: boolean };
        // Keep server-rendered defaults until hydration completes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (value.delay) setDelay(value.delay);
        if (typeof value.random === "boolean") setRandom(value.random);
        if (typeof value.audio === "boolean") setAudio(value.audio);
      }
    } catch { /* Defaults remain usable if settings cannot be read. */ }
  }, []);
  useEffect(() => { window.localStorage.setItem("instant-vocabulary-settings", JSON.stringify({ delay, random, audio })); }, [delay, random, audio]);

  useEffect(() => {
    const restore = window.setTimeout(() => { setSpeechSettings(readSpeechSettings(window.localStorage)); setSpeechSettingsReady(true); }, 0);
    return () => window.clearTimeout(restore);
  }, []);
  useEffect(() => { if (speechSettingsReady) saveSpeechSettings(speechSettings, window.localStorage); }, [speechSettings, speechSettingsReady]);

  const speak = useCallback((word: string, force = false) => { if (!force && !audio) return false; return speakEnglish(word, speechSettings, voices); }, [audio, speechSettings, voices]);
  useEffect(() => {
    if (phase !== "study" || paused || !current || document.hidden) return;
    const speechKey = `${round}:${position}:${current.id}`;
    if (lastAutoSpeechKey.current !== speechKey) { lastAutoSpeechKey.current = speechKey; speak(current.english); }
    const timer = window.setTimeout(() => setRevealed(true), delay);
    return () => window.clearTimeout(timer);
  }, [phase, paused, current, delay, position, round, speak]);
  useEffect(() => { const pauseForVisibility = () => { if (document.hidden && phase === "study") { cancelSpeech(); setPaused(true); } }; document.addEventListener("visibilitychange", pauseForVisibility); return () => document.removeEventListener("visibilitychange", pauseForVisibility); }, [phase]);
  useEffect(() => () => cancelSpeech(), []);

  const start = () => { const first = random ? shuffle(cards) : [...cards]; lastAutoSpeechKey.current = ""; cancelSpeech(); setQueue(first); setRound(1); setRoundSize(first.length); setPosition(0); setRevealed(false); setPaused(false); setInitialIncorrect(0); setAttempts(0); setSwipeX(0); setStartedAt(Date.now()); setFinishedAt(0); setPhase("study"); };
  const judge = useCallback((result: Result) => {
    if (!revealed || !current) return;
    cancelSpeech(); setRevealed(false); setSwipeX(0); setAttempts((count) => count + 1); if (result === "incorrect" && round === 1) setInitialIncorrect((count) => count + 1);
    const nextPosition = position + 1; const nextQueue = result === "incorrect" ? [...queue, current] : queue;
    if (nextPosition < roundSize) { setQueue(nextQueue); setPosition(nextPosition); return; }
    const missed = nextQueue.slice(roundSize);
    if (!missed.length) { setFinishedAt(Date.now()); setPhase("result"); return; }
    const nextRound = random ? shuffle(missed) : missed; setQueue(nextRound); setRound((value) => value + 1); setRoundSize(nextRound.length); setPosition(0);
  }, [current, position, queue, random, revealed, round, roundSize]);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => { if (!revealed || paused) return; if (event.key === "ArrowRight") judge("correct"); if (event.key === "ArrowLeft") judge("incorrect"); };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => { if (!revealed) return; pointerStart.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => { if (pointerStart.current !== null) setSwipeX(event.clientX - pointerStart.current); };
  const onPointerUp = () => { if (pointerStart.current === null) return; const distance = swipeX; pointerStart.current = null; setSwipeX(0); if (Math.abs(distance) > window.innerWidth * 0.25) judge(distance > 0 ? "correct" : "incorrect"); };

  if (phase === "setup") return <main className="page setup-page"><section className="intro"><p className="eyebrow">STUDY SET</p><h1>{setName}</h1><p>{cards.length}語を、一定のリズムで学習します。</p></section><section className="setup-card"><fieldset><legend>自動反転までの時間</legend><div className="delay-options">{[500, 1000, 1500, 2000, 2500, 3000, 4000, 5000].map((ms) => <button key={ms} className={delay === ms ? "selected" : ""} onClick={() => setDelay(ms)}>{(ms / 1000).toFixed(1)}秒</button>)}</div></fieldset><label className="switch-row"><span><strong>出題順</strong><small>{random ? "ランダム" : "登録順"}</small></span><input type="checkbox" checked={random} onChange={(event) => setRandom(event.target.checked)} /></label><label className="switch-row"><span><strong>英語音声</strong><small>{audio ? "自動再生する" : "自動再生しない"}</small></span><input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} /></label><SpeechSettingsPanel voices={voices} loaded={voicesLoaded} supported={speechSupported} settings={speechSettings} onVoiceChange={(voiceURI) => setSpeechSettings((value) => ({ ...value, voiceURI }))} onRateChange={(rate: SpeechRate) => setSpeechSettings((value) => ({ ...value, rate }))} /><button className="primary start" onClick={start}>学習を開始 <span>→</span></button><button className="text-button" onClick={onExit}>セット詳細へ戻る</button></section></main>;
  if (phase === "result") { const seconds = Math.max(1, Math.round((finishedAt - startedAt) / 1000)); const initialCorrect = cards.length - initialIncorrect; return <main className="page result-page"><section className="result-card"><p className="eyebrow">SESSION COMPLETE</p><h1>おつかれさまでした</h1><p className="completion">すべての単語を正答しました。</p><div className="score"><strong>{Math.round((initialCorrect / cards.length) * 100)}<small>%</small></strong><span>初回正答率</span></div><dl><div><dt>初回誤答</dt><dd>{initialIncorrect}語</dd></div><div><dt>復習ラウンド</dt><dd>{round - 1}回</dd></div><div><dt>判定回数</dt><dd>{attempts}回</dd></div><div><dt>学習時間</dt><dd>{Math.floor(seconds / 60)}分{seconds % 60}秒</dd></div></dl><button className="primary" onClick={start}>もう一度学習する</button><button className="text-button" onClick={onExit}>セット詳細へ戻る</button></section></main>; }

  const progress = roundSize ? Math.round((position / roundSize) * 100) : 0;
  return <main className="page study-page" tabIndex={0} onKeyDown={onKeyDown}><header><div><span>{round === 1 ? "通常ラウンド" : `誤答復習 · Round ${round}`}</span><strong>{position + 1} <small>/ {roundSize}</small></strong></div><button className="pause-button" onClick={() => { cancelSpeech(); setPaused(true); }} aria-label="一時停止">Ⅱ</button></header><div className="progress"><i style={{ width: `${progress}%` }} /></div><section className="card-area"><div className={`vocab-card ${revealed ? "is-revealed" : ""} ${swipeX ? "is-dragging" : ""}`} style={{ "--swipe-x": `${swipeX}px`, "--swipe-r": `${swipeX / 30}deg` } as CSSProperties} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}><div className="card-face card-front"><p>ENGLISH</p><h1>{current?.english}</h1><button onClick={() => current && speak(current.english, true)} aria-label="音声を再生">◖</button><span>意味を思い出してください</span></div><div className="card-face card-back"><p>JAPANESE</p><h1>{current?.japanese}</h1><button onClick={() => current && speak(current.english, true)} aria-label="英語音声を再生">◖</button><span>左右にスワイプして判定</span></div></div></section><section className="actions"><button className="incorrect" disabled={!revealed} onClick={() => judge("incorrect")}><kbd>←</kbd><span>誤答</span></button><button className="correct" disabled={!revealed} onClick={() => judge("correct")}><span>正答</span><kbd>→</kbd></button></section><p className="keyboard-hint">キーボードの ← → でも判定できます</p>{paused && <div className="pause-overlay" role="dialog" aria-modal="true"><div><p className="eyebrow">PAUSED</p><h2>学習を一時停止しました</h2><p>再開すると、現在の英単語からもう一度表示します。</p><button className="primary" onClick={() => { lastAutoSpeechKey.current = ""; setRevealed(false); setSwipeX(0); setPaused(false); }}>再開する</button><button className="text-button" onClick={onExit}>学習を終了</button></div></div>}</main>;
}

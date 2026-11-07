"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Timeline clock for the preview. The video timeline is: silent intro → voice → hold/fade.
 * While the voice is audible the audio element is the master clock; otherwise wall-clock time is used.
 */
export function usePlayer(opts: { audioUrl?: string; intro: number; total: number; onFrame: (t: number) => void }) {
  const { audioUrl, intro, total } = opts;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const wallRef = useRef({ start: 0, t0: 0 });
  const frameRef = useRef(opts.onFrame);
  const raf = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const lastUi = useRef(0);

  useEffect(() => { frameRef.current = opts.onFrame; }, [opts.onFrame]);

  useEffect(() => {
    if (!audioUrl) return;
    const a = new Audio(audioUrl);
    a.preload = "auto";
    audioRef.current = a;
    return () => { a.pause(); a.src = ""; audioRef.current = null; };
  }, [audioUrl]);

  const audioDur = () => audioRef.current?.duration || 0;

  const publish = useCallback((t: number, force = false) => {
    tRef.current = t;
    frameRef.current(t);
    const now = performance.now();
    if (force || now - lastUi.current > 60) { lastUi.current = now; setTime(t); }
  }, []);

  const stop = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    cancelAnimationFrame(raf.current);
    audioRef.current?.pause();
  }, []);

  const loop = useCallback(() => {
    if (!playingRef.current) return;
    const a = audioRef.current;
    const now = performance.now();
    const voiceEnd = intro + audioDur();
    let t: number;
    if (a && !a.paused && !a.ended) {
      // voice is audible → audio is the master clock; keep the wall clock in sync for afterwards
      t = intro + a.currentTime;
      wallRef.current = { start: now, t0: t };
    } else {
      t = wallRef.current.t0 + (now - wallRef.current.start) / 1000;
      // reached the voice during the silent intro → start the audio
      if (a && !a.ended && t >= intro && t < voiceEnd - 0.05) {
        a.currentTime = t - intro;
        a.play().catch(() => {});
      }
    }
    if (t >= total) { publish(total, true); stop(); return; }
    publish(t);
    raf.current = requestAnimationFrame(loop);
  }, [intro, total, publish, stop]);

  const play = useCallback((from?: number) => {
    let t = from ?? tRef.current;
    if (t >= total - 0.05) t = 0;
    const a = audioRef.current;
    wallRef.current = { start: performance.now(), t0: t };
    if (a) {
      if (t >= intro && t < intro + audioDur()) { a.currentTime = t - intro; a.play().catch(() => {}); }
      else a.pause();
    }
    playingRef.current = true;
    setPlaying(true);
    publish(t, true);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(loop);
  }, [intro, total, loop, publish]);

  const seek = useCallback((t: number) => {
    t = Math.min(total, Math.max(0, t));
    if (playingRef.current) play(t);
    else publish(t, true);
  }, [total, play, publish]);

  const toggle = useCallback(() => (playingRef.current ? stop() : play()), [play, stop]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /** current position on the voice audio (seconds), i.e. timeline time minus intro */
  const voiceTime = useCallback(() => Math.max(0, tRef.current - intro), [intro]);

  return { playing, time, play, stop, seek, toggle, voiceTime, timeRef: tRef };
}

export type Player = ReturnType<typeof usePlayer>;

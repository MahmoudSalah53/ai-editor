"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, CloudOff, Loader2, Pause, Play } from "lucide-react";
import type { Card, Project, RenderState, TranscriptState } from "@/lib/types";
import { TEMPLATES } from "@/lib/types";
import { autoCards, compile, totalDuration } from "@/lib/compile";
import { api, cx, fmtTime } from "@/components/ui";
import { usePlayer } from "./usePlayer";
import { Preview, frameWindow } from "./Preview";
import { ExportPanel } from "./ExportPanel";
import { TextTab } from "./TextTab";
import { CardsTab } from "./CardsTab";
import { SettingsTab } from "./SettingsTab";
import type { AssetItem } from "./IconPicker";

type Tab = "preview" | "text" | "cards" | "settings";
type Save = "saved" | "saving" | "dirty" | "error";

export interface EditorData { project: Project; transcript: TranscriptState | null; render: RenderState | null; env: number[] }

export function Editor({ initial, initialAssets }: { initial: EditorData; initialAssets: AssetItem[] }) {
  const [project, setProject] = useState(initial.project);
  const [transcript, setTranscript] = useState(initial.transcript);
  const [env, setEnv] = useState(initial.env);
  const [assets, setAssets] = useState(initialAssets);
  const [tab, setTab] = useState<Tab>(initial.project.cards.length ? "cards" : "text");
  const [save, setSave] = useState<Save>("saved");
  const [retrying, setRetrying] = useState(false);
  const [audioKey, setAudioKey] = useState(0);

  /* ---------- autosave ---------- */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const latest = useRef(project);
  latest.current = project;

  const persist = useCallback(async () => {
    timer.current = null;
    setSave("saving");
    const p = latest.current;
    const job = api<{ updatedAt: string }>(`/api/projects/${p.id}`, { method: "PUT", body: JSON.stringify(p) })
      .then(r => { setProject(cur => ({ ...cur, updatedAt: r.updatedAt })); setSave(timer.current ? "dirty" : "saved"); })
      .catch(() => setSave("error"));
    inflight.current = job;
    await job;
  }, []);

  const update = useCallback((patch: Partial<Project>) => {
    setProject(p => ({ ...p, ...patch }));
    setSave("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(persist, 700);
  }, [persist]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); await persist(); }
    else if (inflight.current) await inflight.current;
  }, [persist]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (timer.current) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /* ---------- transcription polling ---------- */
  const tStatus = transcript?.status ?? "idle";
  useEffect(() => {
    if (!project.audio || (tStatus !== "running" && tStatus !== "idle")) return;
    const id = setInterval(async () => {
      try {
        const t = await api<TranscriptState>(`/api/projects/${project.id}/transcribe`);
        setTranscript(t);
        // first transcript: load server-aligned cards (if referenceText was used) or build automatically
        if (t.status === "done" && !latest.current.cards.length && t.words.length) {
          const fresh = await api<EditorData>(`/api/projects/${project.id}`);
          if (fresh.project.cards.length) {
            setProject(fresh.project);
          } else {
            update({ cards: autoCards(t.words) });
          }
          setTab("cards");
        }
      } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [project.audio, project.id, tStatus, update]);

  async function retryTranscript() {
    setRetrying(true);
    try { setTranscript(await api<TranscriptState>(`/api/projects/${project.id}/transcribe`, { method: "POST" })); }
    finally { setRetrying(false); }
  }

  async function reloadAfterAudio() {
    const d = await api<EditorData>(`/api/projects/${project.id}`);
    setProject(d.project); setTranscript(d.transcript); setEnv(d.env); setAudioKey(k => k + 1); setTab("text");
  }

  /* ---------- timeline + player ---------- */
  const assetMap = useMemo(() => new Map(assets.map(a => [a.id, a.url])), [assets]);
  const words = useMemo(() => transcript?.words ?? [], [transcript]);
  const timeline = useMemo(() => compile(project, words, env, id => assetMap.get(id) ?? ""), [project, words, env, assetMap]);
  const total = totalDuration(project);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onFrame = useCallback((t: number) => frameWindow(iframeRef)?.renderAt?.(t), []);
  const audioUrl = project.audio ? `/api/files/projects/${project.id}/${project.audio.file}?v=${audioKey}` : undefined;
  const player = usePlayer({ audioUrl, intro: project.timing.intro, total, onFrame });

  const vt = player.time - project.timing.intro;
  const activeLineId = useMemo(() => {
    const lines = project.cards.flatMap(c => c.lines);
    let id: string | null = null;
    for (const l of lines) if (vt >= l.start - 0.02) id = l.id;
    return vt >= 0 ? id : null;
  }, [project.cards, vt]);

  const setCards = useCallback((cards: Card[]) => update({ cards }), [update]);
  const playAt = useCallback((voiceT: number) => player.play(project.timing.intro + voiceT), [player, project.timing.intro]);

  const tabs: { id: Tab; label: string; mobileOnly?: boolean }[] = [
    { id: "preview", label: "المعاينة", mobileOnly: true },
    { id: "text", label: "النص" },
    { id: "cards", label: "الترجمة والتوقيت" },
    { id: "settings", label: "الإعدادات" },
  ];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden">
      {/* top bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-stone-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="grid size-9 shrink-0 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800" aria-label="رجوع">
            <ArrowRight className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-stone-900 sm:text-lg">{project.title}</h1>
            <p className="text-xs text-stone-500">{TEMPLATES[project.template].name} · {fmtTime(total)}</p>
          </div>
        </div>

        {/* tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "relative shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition sm:text-sm",
                t.mobileOnly && "lg:hidden",
                tab === t.id ? "bg-stone-100 text-stone-900 font-semibold" : "text-stone-500 hover:bg-stone-50 hover:text-stone-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <SaveIndicator state={save} />
      </header>

      {/* Main workspace layout: natural comfortable layout centered with fixed preview */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 justify-center gap-6 overflow-hidden px-4 sm:px-6">
        {/* Right pane: Form / Cards / Settings (Scrollbar on the right edge via dir="ltr" on scroll container) */}
        <main dir="ltr" className={cx("min-w-0 flex-1 overflow-y-auto py-5 ps-2 pe-3", tab === "preview" && "hidden lg:block")}>
          <div dir="rtl" className="mx-auto max-w-3xl pb-24 lg:pb-12">
            {tab === "text" || (tab === "preview" && false) ? (
              <TextTab
                key={`${audioKey}-${tStatus}`}
                transcript={transcript}
                cards={project.cards}
                audioDuration={project.audio?.duration ?? 0}
                onCards={c => { setCards(c); setTab("cards"); }}
                onRetry={retryTranscript}
                retrying={retrying}
              />
            ) : null}
            {tab === "cards" || tab === "preview" ? (
              <CardsTab
                cards={project.cards}
                words={words}
                audioDuration={project.audio?.duration ?? 0}
                template={project.template}
                assets={assets}
                activeLineId={activeLineId}
                onChange={setCards}
                onAssets={a => setAssets(cur => [...cur, ...a])}
                playAt={playAt}
                voiceTime={player.voiceTime}
                goToText={() => setTab("text")}
              />
            ) : null}
            {tab === "settings" ? <SettingsTab project={project} onChange={update} onAudioReplaced={reloadAfterAudio} onSeek={player.seek} /> : null}
          </div>
        </main>

        {/* Left pane: Preview & Export (Original full size with visible scrollbar beside it) */}
        <aside className={cx("w-[380px] shrink-0 overflow-y-auto py-5 ps-2 lg:block", tab === "preview" ? "block" : "hidden")}>
          <div className="space-y-4 pb-12">
            <Preview template={project.template} timeline={timeline} player={player} iframeRef={iframeRef} />
            <ExportPanel
              projectId={project.id}
              title={project.title}
              initial={initial.render}
              canExport={!!project.audio && project.cards.some(c => c.lines.length)}
              beforeExport={flush}
              updatedAt={project.updatedAt}
            />
          </div>
        </aside>
      </div>

      {/* mobile mini player while editing */}
      {tab !== "preview" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <button onClick={player.toggle} className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-white" aria-label={player.playing ? "إيقاف" : "تشغيل"}>
              {player.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <input
              type="range" className="scrub min-w-0 flex-1" min={0} max={total || 1} step={0.01} value={player.time}
              onChange={e => player.seek(parseFloat(e.target.value))}
              style={{ ["--p" as string]: `${total ? (player.time / total) * 100 : 0}%` }}
              aria-label="الموضع"
            />
            <span className="w-12 text-end text-xs text-stone-500 tabular-nums" dir="ltr">{fmtTime(player.time)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SaveIndicator({ state }: { state: Save }) {
  const map = {
    saved: { icon: <Check className="size-3.5" />, text: "تم الحفظ", cls: "text-stone-400" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "جارٍ الحفظ", cls: "text-stone-500" },
    dirty: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "جارٍ الحفظ", cls: "text-stone-500" },
    error: { icon: <CloudOff className="size-3.5" />, text: "تعذّر الحفظ", cls: "text-red-600" },
  }[state];
  return <span className={cx("ms-auto flex items-center gap-1 text-xs", map.cls)}>{map.icon}{map.text}</span>;
}

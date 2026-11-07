"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { TemplateId, TemplateTimeline } from "@/lib/types";
import { fmtTime } from "@/components/ui";
import type { Player } from "./usePlayer";

type TemplateWindow = Window & { TEMPLATE_READY?: boolean; loadTimeline?: (t: TemplateTimeline) => Promise<boolean>; renderAt?: (t: number) => void };

export const frameWindow = (ref: RefObject<HTMLIFrameElement | null>) => ref.current?.contentWindow as TemplateWindow | null | undefined;

/** Live 9:16 preview: the real template page in an iframe, scaled to fit. */
export function Preview({ template, timeline, player, iframeRef }: { template: TemplateId; timeline: TemplateTimeline; player: Player; iframeRef: RefObject<HTMLIFrameElement | null> }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1080));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    setFrameReady(false);
    setReady(false);
    let cancelled = false;
    const check = () => {
      if (cancelled) return;
      const w = frameWindow(iframeRef);
      if (w?.TEMPLATE_READY) setFrameReady(true);
      else setTimeout(check, 40);
    };
    check();
    return () => { cancelled = true; };
  }, [template, iframeRef]);

  // (re)load the timeline into the template whenever it changes (debounced)
  useEffect(() => {
    if (!frameReady) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      const w = frameWindow(iframeRef);
      if (!w?.loadTimeline) return;
      await w.loadTimeline(timeline);
      if (cancelled) return;
      w.renderAt?.(player.timeRef.current);
      setReady(true);
    }, 80);
    return () => { cancelled = true; clearTimeout(id); };
  }, [timeline, frameReady, iframeRef, player.timeRef]);

  function onLoad() {
    const w = frameWindow(iframeRef);
    if (w?.TEMPLATE_READY) setFrameReady(true);
  }

  const pct = timeline.total ? (player.time / timeline.total) * 100 : 0;

  return (
    <div className="space-y-3">
      <div
        ref={box}
        className="relative mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-2xl bg-stone-900 shadow-sm ring-1 ring-stone-200"
      >
        <iframe
          ref={iframeRef}
          key={template}
          src={`/templates/${template}/index.html`}
          onLoad={onLoad}
          title="معاينة"
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
          style={{ width: 1080, height: 1920, transform: `scale(${scale})` }}
        />
        {!ready ? <div className="absolute inset-0 grid place-items-center text-sm text-stone-400">جارٍ التحميل…</div> : null}
        <button onClick={player.toggle} className="absolute inset-0" aria-label={player.playing ? "إيقاف" : "تشغيل"} />
      </div>

      <div className="mx-auto flex w-full max-w-[360px] items-center gap-2">
        <button onClick={player.toggle} className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white shadow-sm hover:bg-accent-hover" aria-label={player.playing ? "إيقاف" : "تشغيل"}>
          {player.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button onClick={() => player.seek(0)} className="grid size-8 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100" aria-label="من البداية">
          <RotateCcw className="size-4" />
        </button>
        <input
          type="range"
          className="scrub min-w-0 flex-1"
          min={0}
          max={timeline.total || 1}
          step={0.01}
          value={player.time}
          onChange={e => player.seek(parseFloat(e.target.value))}
          style={{ ["--p" as string]: `${pct}%` }}
          aria-label="الموضع"
        />
        <span className="w-[86px] shrink-0 text-end text-xs text-stone-500 tabular-nums" dir="ltr">{fmtTime(player.time)} / {fmtTime(timeline.total)}</span>
      </div>
    </div>
  );
}

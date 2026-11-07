import { NextResponse, type NextRequest } from "next/server";
import { getSettings, saveSettings } from "@/lib/storage";
import type { Settings } from "@/lib/types";

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(req: NextRequest) {
  const cur = await getSettings();
  const b = (await req.json().catch(() => ({}))) as Partial<Settings>;
  const num = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  const next: Settings = {
    channelName: typeof b.channelName === "string" && b.channelName.trim() ? b.channelName.trim().slice(0, 60) : cur.channelName,
    whisperModel: typeof b.whisperModel === "string" && b.whisperModel.trim() ? b.whisperModel.trim() : cur.whisperModel,
    renderWorkers: Math.round(num(b.renderWorkers, 1, 8, cur.renderWorkers)),
    timing: {
      intro: num(b.timing?.intro, 0, 10, cur.timing.intro),
      hold: num(b.timing?.hold, 0, 10, cur.timing.hold),
      fade: num(b.timing?.fade, 0.2, 10, cur.timing.fade),
    },
  };
  await saveSettings(next);
  return NextResponse.json(next);
}

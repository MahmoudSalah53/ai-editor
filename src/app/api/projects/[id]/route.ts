import { NextResponse, type NextRequest } from "next/server";
import { deleteProject, getEnv, getProject, getRender, getTranscript, saveProject } from "@/lib/storage";
import { cancelRender } from "@/lib/jobs";
import type { Project } from "@/lib/types";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const [project, transcript, render, env] = await Promise.all([getProject(id), getTranscript(id).catch(() => null), getRender(id).catch(() => null), getEnv(id).catch(() => [])]);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ project, transcript, render, env });
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const current = await getProject(id);
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json()) as Partial<Project>;
  // only editable fields; id/audio/createdAt stay server-owned
  const next: Project = {
    ...current,
    title: typeof body.title === "string" ? body.title.slice(0, 120) : current.title,
    template: body.template === "library" || body.template === "kids" ? body.template : current.template,
    channelName: typeof body.channelName === "string" ? body.channelName.slice(0, 60) : current.channelName,
    timing: body.timing ? {
      intro: clampNum(body.timing.intro, 0, 10, current.timing.intro),
      hold: clampNum(body.timing.hold, 0, 10, current.timing.hold),
      fade: clampNum(body.timing.fade, 0.2, 10, current.timing.fade),
    } : current.timing,
    cards: Array.isArray(body.cards) ? body.cards : current.cards,
  };
  const saved = await saveProject(next);
  return NextResponse.json({ updatedAt: saved.updatedAt });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  await cancelRender(id).catch(() => {});
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}

function clampNum(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" && isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

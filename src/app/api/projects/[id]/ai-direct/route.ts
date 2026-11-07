import { NextResponse, type NextRequest } from "next/server";
import { autoDescribeAssets, aiDirectProject } from "@/lib/ai-director";
import { assetUrl, getProject, listAssets, saveAssets, saveProject } from "@/lib/storage";
import type { Card } from "@/lib/types";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/projects/[id]/ai-direct">) {
  const { id } = await ctx.params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { cards?: Card[] };
  const inputCards = Array.isArray(body.cards) && body.cards.length ? body.cards : project.cards;

  // 1. Ensure all available library icons have clear Arabic names & semantic descriptions for the AI
  const rawAssets = await listAssets();
  const { assets, changed } = await autoDescribeAssets(rawAssets);
  if (changed) {
    await saveAssets(assets);
  }

  // 2. Direct all lines (poses, icons, same-as-previous, labels, accents) via Cloud AI
  const { cards, source } = await aiDirectProject(inputCards, assets);
  const saved = await saveProject({ ...project, cards });

  return NextResponse.json({
    cards: saved.cards,
    assets: assets.map(a => ({ ...a, url: assetUrl(a) })),
    source,
  });
}

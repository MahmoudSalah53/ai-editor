import { NextResponse, type NextRequest } from "next/server";
import { deleteAsset, updateAsset } from "@/lib/storage";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/assets/[id]">) {
  const { id } = await ctx.params;
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });
  await updateAsset(id, name.trim().slice(0, 60));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/assets/[id]">) {
  const { id } = await ctx.params;
  await deleteAsset(id);
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { deleteAsset, updateAsset } from "@/lib/storage";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/assets/[id]">) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { name?: string; description?: string };
  if (body.name === undefined && body.description === undefined) {
    return NextResponse.json({ error: "البيانات مطلوبة" }, { status: 400 });
  }
  await updateAsset(id, {
    ...(body.name !== undefined ? { name: body.name.trim().slice(0, 60) } : {}),
    ...(body.description !== undefined ? { description: body.description.trim().slice(0, 200) } : {}),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/assets/[id]">) {
  const { id } = await ctx.params;
  await deleteAsset(id);
  return NextResponse.json({ ok: true });
}

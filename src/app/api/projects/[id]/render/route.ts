import { NextResponse, type NextRequest } from "next/server";
import { getProject, getRender } from "@/lib/storage";
import { cancelRender, startRender } from "@/lib/jobs";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/render">) {
  const { id } = await ctx.params;
  const { pid: _pid, ...r } = await getRender(id);
  return NextResponse.json(r);
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/projects/[id]/render">) {
  const { id } = await ctx.params;
  if (!(await getProject(id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  // the renderer talks to this same server over loopback
  const port = req.nextUrl.port || (req.nextUrl.protocol === "https:" ? "443" : "80");
  const baseUrl = `http://127.0.0.1:${process.env.PORT || port}`;
  const pw = process.env.STUDIO_PASSWORD;
  try {
    await startRender(id, baseUrl, pw ? { name: AUTH_COOKIE, value: await authToken(pw) } : undefined);
    const { pid: _pid, ...r } = await getRender(id);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/render">) {
  const { id } = await ctx.params;
  await cancelRender(id);
  return NextResponse.json({ status: "idle", progress: 0 });
}

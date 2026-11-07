import { NextResponse, type NextRequest } from "next/server";
import { getProject, getTranscript } from "@/lib/storage";
import { startTranscription } from "@/lib/jobs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/transcribe">) {
  const { id } = await ctx.params;
  return NextResponse.json(await getTranscript(id));
}

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]/transcribe">) {
  const { id } = await ctx.params;
  if (!(await getProject(id))) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    await startTranscription(id);
    return NextResponse.json(await getTranscript(id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

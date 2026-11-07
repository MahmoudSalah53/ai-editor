import { NextResponse, type NextRequest } from "next/server";
import { createProject, listProjects } from "@/lib/storage";
import type { TemplateId } from "@/lib/types";

export async function GET() {
  return NextResponse.json(await listProjects());
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { title?: string; template?: TemplateId };
  const template: TemplateId = body.template === "library" ? "library" : "kids";
  const p = await createProject((body.title ?? "").trim().slice(0, 120), template);
  return NextResponse.json(p, { status: 201 });
}

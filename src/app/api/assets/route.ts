import { NextResponse, type NextRequest } from "next/server";
import path from "node:path";
import { addAsset, assetUrl, listAssets } from "@/lib/storage";

const IMG = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

export async function GET() {
  const assets = await listAssets();
  return NextResponse.json(assets.map(a => ({ ...a, url: assetUrl(a) })));
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "لم يتم اختيار صور" }, { status: 400 });
  const added = [];
  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase();
    if (!IMG.has(ext)) continue;
    const name = path.parse(f.name).name.replace(/[_-]+/g, " ").slice(0, 60);
    const a = await addAsset(name, Buffer.from(await f.arrayBuffer()), ext === ".jpeg" ? ".jpg" : ext);
    added.push({ ...a, url: assetUrl(a) });
  }
  if (!added.length) return NextResponse.json({ error: "الصيغ المسموحة: PNG, JPG, WEBP, SVG" }, { status: 400 });
  return NextResponse.json(added, { status: 201 });
}

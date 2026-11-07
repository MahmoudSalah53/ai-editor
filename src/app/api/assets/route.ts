import { NextResponse, type NextRequest } from "next/server";
import path from "node:path";
import { autoDescribeAssets } from "@/lib/ai-director";
import { addAsset, assetUrl, listAssets, saveAssets } from "@/lib/storage";

const IMG = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

export async function GET() {
  const assets = await listAssets();
  return NextResponse.json(assets.map(a => ({ ...a, url: assetUrl(a) })));
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "لم يتم اختيار صور" }, { status: 400 });
  const addedIds = new Set<string>();
  for (const f of files) {
    const ext = path.extname(f.name).toLowerCase();
    if (!IMG.has(ext)) continue;
    const name = path.parse(f.name).name.replace(/[_-]+/g, " ").slice(0, 60);
    const a = await addAsset(name, Buffer.from(await f.arrayBuffer()), ext === ".jpeg" ? ".jpg" : ext);
    addedIds.add(a.id);
  }
  if (!addedIds.size) return NextResponse.json({ error: "الصيغ المسموحة: PNG, JPG, WEBP, SVG" }, { status: 400 });

  // Automatically name & describe newly uploaded icons if they lack Arabic names/descriptions
  const all = await listAssets();
  const { assets: enriched, changed } = await autoDescribeAssets(all);
  if (changed) await saveAssets(enriched);

  const added = enriched.filter(a => addedIds.has(a.id)).map(a => ({ ...a, url: assetUrl(a) }));
  return NextResponse.json(added, { status: 201 });
}

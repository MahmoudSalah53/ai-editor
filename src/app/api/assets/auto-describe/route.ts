import { NextResponse } from "next/server";
import { autoDescribeAssets } from "@/lib/ai-director";
import { assetUrl, listAssets, saveAssets } from "@/lib/storage";

export async function POST() {
  const raw = await listAssets();
  const { assets, changed } = await autoDescribeAssets(raw);
  if (changed) {
    await saveAssets(assets);
  }
  return NextResponse.json(assets.map(a => ({ ...a, url: assetUrl(a) })));
}

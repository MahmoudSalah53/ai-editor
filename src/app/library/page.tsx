import { connection } from "next/server";
import { assetUrl, listAssets } from "@/lib/storage";
import { LibraryView } from "@/components/library/LibraryView";

export default async function LibraryPage() {
  await connection();
  const assets = await listAssets();
  return <LibraryView initialAssets={assets.map(a => ({ ...a, url: assetUrl(a) }))} />;
}

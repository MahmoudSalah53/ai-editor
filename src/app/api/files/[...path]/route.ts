import { type NextRequest } from "next/server";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { DATA_DIR } from "@/lib/storage";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ogg": "audio/ogg", ".opus": "audio/ogg", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav",
  ".flac": "audio/flac", ".webm": "audio/webm", ".mp4": "video/mp4",
};

/** Serves files from the data folder (voice, rendered video, library images) with HTTP range support. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/files/[...path]">) {
  const parts = (await ctx.params).path.map(decodeURIComponent);
  if (parts[0] !== "projects" && parts[0] !== "assets") return new Response("not found", { status: 404 });
  const full = path.resolve(DATA_DIR, ...parts);
  if (!full.startsWith(path.resolve(DATA_DIR) + path.sep) || /\.json$/i.test(full)) return new Response("not found", { status: 404 });

  let stat;
  try { stat = await fs.stat(full); } catch { return new Response("not found", { status: 404 }); }
  if (!stat.isFile()) return new Response("not found", { status: 404 });

  const type = TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  if (req.nextUrl.searchParams.has("download")) {
    const name = req.nextUrl.searchParams.get("download") || path.basename(full);
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
  }

  const range = req.headers.get("range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    const start = m[1] ? parseInt(m[1], 10) : Math.max(0, stat.size - parseInt(m[2], 10));
    const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    const stream = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(stat.size) } });
}

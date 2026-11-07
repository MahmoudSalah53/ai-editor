// Renders a project to MP4.
// Loads the template page in Edge/Chrome (playwright-core), steps through every frame with
// renderAt(t), pipes JPEG frames to ffmpeg in parallel segments, then concatenates and adds the voice.
// usage: node render.mjs <render-input.json>

import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";

const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
const { timeline, templateUrl, audioPath, outDir, outName, workers, fps, ffmpeg, cookie } = input;
const statusFile = path.join(outDir, "render.json");
const W = 1080, H = 1920;
const total = timeline.total;
const frames = Math.round(total * fps);
const startedAt = new Date().toISOString();

let lastWrite = 0;
let chain = Promise.resolve();
function status(s, force = false) {
  const now = Date.now();
  if (!force && now - lastWrite < 700) return chain;
  lastWrite = now;
  // serialise writes so a late progress update can never overwrite the final state
  chain = chain.then(async () => {
    const tmp = `${statusFile}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ startedAt, pid: process.pid, ...s }));
    await fs.rename(tmp, statusFile);
  }).catch(() => {});
  return chain;
}

function encoder(file) {
  const p = spawn(ffmpeg, [
    "-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high",
    "-r", String(fps), "-an", file,
  ], { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
  let err = "";
  p.stderr.on("data", d => (err += d.toString()));
  const done = new Promise((res, rej) => p.on("close", c => (c === 0 ? res() : rej(new Error("ffmpeg: " + err.slice(-400))))));
  return { p, done };
}

function write(stream, buf) {
  return new Promise((res, rej) => (stream.write(buf, e => (e ? rej(e) : res()))));
}

function launch() {
  const args = ["--force-color-profile=srgb", "--disable-lcd-text", "--autoplay-policy=no-user-gesture-required"];
  const tryChannels = [process.env.RENDER_BROWSER_CHANNEL, "msedge", "chrome"].filter(Boolean);
  return (async () => {
    let lastErr;
    for (const channel of tryChannels) {
      try { return await chromium.launch({ channel, args }); } catch (e) { lastErr = e; }
    }
    if (process.env.RENDER_BROWSER_PATH) return chromium.launch({ executablePath: process.env.RENDER_BROWSER_PATH, args });
    throw lastErr;
  })();
}

async function main() {
  await status({ status: "running", progress: 0, stage: "تشغيل المتصفح" }, true);
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  if (cookie) await context.addCookies([{ name: cookie.name, value: cookie.value, url: cookie.url }]);

  const n = Math.max(1, Math.min(workers, Math.ceil(frames / 60)));
  const per = Math.ceil(frames / n);
  const done = new Array(n).fill(0);
  const segs = [];

  async function worker(w) {
    const a = w * per, b = Math.min(frames, a + per);
    if (a >= b) return;
    const page = await context.newPage();
    await page.goto(templateUrl, { waitUntil: "load" });
    await page.waitForFunction(() => window.TEMPLATE_READY === true);
    await page.evaluate(t => window.loadTimeline(t), timeline);
    await page.waitForTimeout(150);
    const file = path.join(outDir, `seg_${w}.mp4`);
    segs[w] = file;
    const enc = encoder(file);
    for (let i = a; i < b; i++) {
      await page.evaluate(t => window.renderAt(t), i / fps);
      const buf = await page.screenshot({ type: "jpeg", quality: 94 });
      await write(enc.p.stdin, buf);
      done[w] = i - a + 1;
      const sum = done.reduce((s, x) => s + x, 0);
      status({ status: "running", progress: (sum / frames) * 0.95, stage: `رسم الإطارات ${sum}/${frames}` });
    }
    enc.p.stdin.end();
    await enc.done;
    await page.close();
  }

  await status({ status: "running", progress: 0, stage: "رسم الإطارات" }, true);
  await Promise.all(Array.from({ length: n }, (_, w) => worker(w)));
  await browser.close();

  await status({ status: "running", progress: 0.96, stage: "دمج الصوت" }, true);
  const list = path.join(outDir, "segments.txt");
  await fs.writeFile(list, segs.filter(Boolean).map(f => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const delay = Math.round(timeline.introDuration * 1000);
  const tmpOut = path.join(outDir, `${outName}.tmp.mp4`);
  await new Promise((res, rej) => {
    const p = spawn(ffmpeg, [
      "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-i", audioPath,
      "-filter_complex", `[1:a]aresample=48000,adelay=${delay}|${delay},apad,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
      "-map", "0:v", "-map", "[a]", "-t", total.toFixed(3), "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", tmpOut,
    ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let err = ""; p.stderr.on("data", d => (err += d.toString()));
    p.on("close", c => (c === 0 ? res() : rej(new Error("ffmpeg mux: " + err.slice(-400)))));
  });
  await fs.rename(tmpOut, path.join(outDir, outName));
  await Promise.all([list, ...segs.filter(Boolean)].map(f => fs.rm(f, { force: true })));
  await status({ status: "done", progress: 1, stage: "تم", output: outName, finishedAt: new Date().toISOString() }, true);
}

main().catch(async e => {
  await status({ status: "error", progress: 0, error: String(e?.message || e).slice(-600) }, true);
  process.exit(1);
});

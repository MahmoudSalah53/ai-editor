// Arabic text helpers: normalisation, tokenising and word-level alignment
// between the user's (diacritised) text and the timed words from Whisper.

import type { TimedWord } from "./types";

const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const PUNCT = /[«»"“”'‘’()\[\]{}.,،؛;:!?؟…\-–—_*ﷺ]/g;

/** Strip tashkeel, tatweel and punctuation and unify letter variants — used only for matching. */
export function normalize(word: string): string {
  return word
    .replace(DIACRITICS, "")
    .replace(PUNCT, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .trim();
}

/** Split a display line into words. Stand-alone punctuation (e.g. a lone « ) is glued to its neighbour. */
export function tokenize(text: string): string[] {
  const raw = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    if (normalize(w) === "") {
      if (out.length && /[»”)]|[،.:؛!?؟]/.test(w)) out[out.length - 1] += w; // closing → previous word
      else if (i + 1 < raw.length) raw[i + 1] = w + raw[i + 1]; // opening → next word
      else if (out.length) out[out.length - 1] += w;
      else out.push(w);
    } else out.push(w);
  }
  return out;
}

/** Number of visible letters (ignores diacritics/punctuation) — used to weight time distribution. */
export function letterCount(word: string): number {
  return Math.max(1, normalize(word).length);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  // ignore a leading و / ف / ب / ل clitic difference
  const d = Math.min(levenshtein(na, nb), levenshtein(na.replace(/^[وفبل]/, ""), nb.replace(/^[وفبل]/, "")) + 0.5);
  return 1 - d / Math.max(na.length, nb.length);
}

/**
 * Needleman–Wunsch alignment of display tokens to timed Whisper words.
 * Returns, for every token, the index of the matched timed word (or -1).
 */
export function alignTokens(tokens: string[], words: TimedWord[]): number[] {
  const n = tokens.length, m = words.length;
  const GAP = -0.45;
  const score: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const move: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)); // 0 diag,1 up,2 left
  for (let i = 1; i <= n; i++) { score[i][0] = i * GAP; move[i][0] = 1; }
  for (let j = 1; j <= m; j++) { score[0][j] = j * GAP; move[0][j] = 2; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = similarity(tokens[i - 1], words[j - 1].w);
      const diag = score[i - 1][j - 1] + (s * 2 - 0.8);
      const up = score[i - 1][j] + GAP;
      const left = score[i][j - 1] + GAP;
      if (diag >= up && diag >= left) { score[i][j] = diag; move[i][j] = 0; }
      else if (up >= left) { score[i][j] = up; move[i][j] = 1; }
      else { score[i][j] = left; move[i][j] = 2; }
    }
  }
  const res = new Array(n).fill(-1);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && move[i][j] === 0) {
      if (similarity(tokens[i - 1], words[j - 1].w) > 0.34) res[i - 1] = j - 1;
      i--; j--;
    } else if (i > 0 && (j === 0 || move[i][j] === 1)) i--;
    else j--;
  }
  return res;
}

/**
 * Word start times for a display line, given the line's [start, end] window and
 * all timed words. Matched words take Whisper's timing, the rest are interpolated
 * by letter count. Always monotonic and inside the window.
 */
export function wordTimes(text: string, start: number, end: number, all: TimedWord[]): number[] {
  const tokens = tokenize(text);
  if (!tokens.length) return [];
  const span = Math.max(0.2, end - start);
  const inWin = all.filter(w => w.s >= start - 0.25 && w.s < end - 0.05);
  const match = inWin.length ? alignTokens(tokens, inWin) : new Array(tokens.length).fill(-1);
  const times: (number | null)[] = match.map(k => (k >= 0 ? clamp(inWin[k].s, start, end) : null));
  times[0] = start;

  // interpolate gaps by letter weight
  const weights = tokens.map(letterCount);
  let i = 0;
  while (i < tokens.length) {
    if (times[i] !== null) { i++; continue; }
    let a = i - 1; // known before
    let b = i; while (b < tokens.length && times[b] === null) b++;
    const tA = times[a] as number;
    const tB = b < tokens.length ? (times[b] as number) : Math.min(end, tA + span);
    const tot = weights.slice(a, b).reduce((s, x) => s + x, 0) || 1;
    let acc = weights[a];
    for (let k = i; k < b; k++) { times[k] = tA + (tB - tA) * (acc / tot) * (b < tokens.length ? 1 : 0.92); acc += weights[k]; }
    i = b;
  }
  // enforce monotonic order
  const out = times as number[];
  for (let k = 1; k < out.length; k++) if (out[k] < out[k - 1] + 0.04) out[k] = Math.min(end, out[k - 1] + 0.04);
  return out.map(t => Math.round(t * 1000) / 1000);
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

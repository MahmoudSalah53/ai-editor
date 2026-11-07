// Turns the editable project into the timeline consumed by the HTML templates,
// and builds cards automatically from the transcript or from pasted text.

import { tokenize, wordTimes, alignTokens, normalize, letterCount } from "./arabic";
import { vocalizeText } from "./tashkeel";
import type { Card, Line, PoseId, Project, TemplateTimeline, TimedWord } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function totalDuration(p: Project): number {
  const a = p.audio?.duration ?? 0;
  return r3(p.timing.intro + a + p.timing.hold + p.timing.fade + 0.25);
}

/**
 * Re-aligns line [start, end] boundaries across all cards when words are moved/edited
 * between lines so each line starts when its first word is actually spoken.
 */
export function realignCards(cards: Card[], words: TimedWord[], audioDuration: number): Card[] {
  if (!words.length) return cards;
  const flatLines = cards.flatMap(c => c.lines);
  if (!flatLines.length) return cards;

  const tokensPerLine = flatLines.map(l => tokenize(l.text));
  const allTokens = tokensPerLine.flat();
  if (!allTokens.length) return cards;

  const match = alignTokens(allTokens, words);

  let tokIdx = 0;
  const matchedStart: (number | null)[] = [];
  const matchedEnd: (number | null)[] = [];
  for (let li = 0; li < flatLines.length; li++) {
    const toks = tokensPerLine[li];
    let s: number | null = null;
    let e: number | null = null;
    for (let j = 0; j < toks.length; j++, tokIdx++) {
      const m = match[tokIdx];
      if (m >= 0) {
        if (s === null) s = words[m].s;
        e = words[m].e;
      }
    }
    matchedStart.push(s);
    matchedEnd.push(e);
  }

  const n = flatLines.length;
  const finalStarts: number[] = new Array(n);
  const finalEnds: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    if (matchedStart[i] !== null) {
      finalStarts[i] = matchedStart[i] as number;
    } else {
      finalStarts[i] = flatLines[i].start;
    }
  }

  for (let i = 0; i < n; i++) {
    const nextStart = i + 1 < n ? finalStarts[i + 1] : Math.max(audioDuration, flatLines[i].end);
    const rawEnd = matchedEnd[i] !== null ? Math.max(matchedEnd[i] as number, finalStarts[i] + 0.2) : flatLines[i].end;
    finalEnds[i] = Math.max(finalStarts[i] + 0.2, i + 1 < n ? Math.min(nextStart, Math.max(rawEnd, nextStart - 0.05)) : rawEnd);
  }

  let cursor = 0;
  return cards.map(c => ({
    ...c,
    lines: c.lines.map(l => {
      const idx = cursor++;
      return {
        ...l,
        start: r2(Math.max(0, finalStarts[idx])),
        end: r2(Math.max(finalStarts[idx] + 0.2, finalEnds[idx])),
      };
    }),
  }));
}

export function compile(p: Project, words: TimedWord[], env: number[], iconUrl: (id: string) => string): TemplateTimeline {
  const audioDuration = p.audio?.duration ?? 0;
  const cards = p.cards.filter(c => c.lines.length);
  const out: TemplateTimeline["cards"] = [];
  const scenes: TemplateTimeline["scenes"] = [];
  const poses: TemplateTimeline["poses"] = [];

  // Global alignment across all lines so moving a word to another line keeps its exact spoken time
  const flatLines = cards.flatMap(c => c.lines);
  const tokensPerLine = flatLines.map(l => tokenize(l.text));
  const allTokens = tokensPerLine.flat();
  const globalMatch = words.length && allTokens.length ? alignTokens(allTokens, words) : new Array(allTokens.length).fill(-1);

  // Compute exact word timestamps per flat line using global match first, then fallback interpolation
  const lineWordTimes: number[][] = [];
  let globalOffset = 0;
  for (let idx = 0; idx < flatLines.length; idx++) {
    const l = flatLines[idx];
    const toks = tokensPerLine[idx];
    if (!toks.length) {
      lineWordTimes.push([]);
      continue;
    }
    const lineMatch = globalMatch.slice(globalOffset, globalOffset + toks.length);
    globalOffset += toks.length;

    const hasGlobalMatch = lineMatch.some(m => m >= 0);
    if (!hasGlobalMatch) {
      const fallbackEnd = Math.max(l.start + 0.2, l.end);
      lineWordTimes.push(wordTimes(l.text, l.start, fallbackEnd, words));
      continue;
    }

    const times: (number | null)[] = lineMatch.map(m => (m >= 0 ? words[m].s : null));
    const weights = toks.map(letterCount);
    const firstMatchedIdx = times.findIndex(t => t !== null);
    const lastMatchedIdx = times.findLastIndex(t => t !== null);

    // Fill leading unmatched tokens before firstMatchedIdx
    if (firstMatchedIdx > 0) {
      const tFirst = times[firstMatchedIdx] as number;
      const tStart = Math.min(l.start, Math.max(0, tFirst - 0.25 * firstMatchedIdx));
      const tot = weights.slice(0, firstMatchedIdx).reduce((s, x) => s + x, 0) || 1;
      let acc = 0;
      for (let k = 0; k < firstMatchedIdx; k++) {
        times[k] = tStart + (tFirst - tStart) * (acc / tot);
        acc += weights[k];
      }
    }

    // Fill internal and trailing unmatched tokens
    let i = Math.max(1, firstMatchedIdx + 1);
    while (i < toks.length) {
      if (times[i] !== null) { i++; continue; }
      const a = i - 1;
      let b = i;
      while (b < toks.length && times[b] === null) b++;
      const tA = times[a] as number;
      const lastWordEnd = lineMatch[lastMatchedIdx] >= 0 ? words[lineMatch[lastMatchedIdx]].e : l.end;
      const tB = b < toks.length ? (times[b] as number) : Math.max(tA + 0.2, l.end, lastWordEnd);
      const tot = weights.slice(a, b).reduce((s, x) => s + x, 0) || 1;
      let acc = weights[a];
      for (let k = i; k < b; k++) {
        times[k] = tA + (tB - tA) * (acc / tot) * (b < toks.length ? 1 : 0.92);
        acc += weights[k];
      }
      i = b;
    }

    const monotonic = times as number[];
    for (let k = 1; k < monotonic.length; k++) {
      if (monotonic[k] < monotonic[k - 1] + 0.03) monotonic[k] = monotonic[k - 1] + 0.03;
    }
    lineWordTimes.push(monotonic.map(r3));
  }

  let flatCursor = 0;
  const compiledCards = cards.map(c => {
    const lines = c.lines.map(l => {
      const idx = flatCursor++;
      const ts = lineWordTimes[idx];
      const effectiveT = ts.length ? Math.min(l.start, ts[0]) : l.start;
      return {
        raw: l,
        t: r3(effectiveT),
        text: tokensPerLine[idx].join(" "),
        ts,
        accent: l.accent || undefined,
      };
    });
    return { card: c, lines };
  });

  compiledCards.forEach((cc, ci) => {
    const next = compiledCards[ci + 1];
    const firstT = cc.lines[0].t;
    const start = Math.max(0, firstT - 0.08);
    const nextFirstT = next ? next.lines[0].t : 9999;
    const end = next ? Math.max(start + 0.3, nextFirstT - 0.08) : 9999;
    const lastRaw = cc.card.lines[cc.card.lines.length - 1];

    out.push({
      start: r3(start),
      end: r3(end),
      header: cc.card.header?.trim() || undefined,
      footer: cc.card.footer?.trim() || undefined,
      footerT: cc.card.footer ? r3(Math.min(lastRaw.end + 0.1, end - 0.6)) : undefined,
      lines: cc.lines.map(({ t, text, ts, accent }) => ({ t, text, ts, accent })),
    });
  });

  const allCompiledLines = compiledCards.flatMap(cc => cc.lines);
  let activeScene: TemplateTimeline["scenes"][number] | null = null;
  for (let i = 0; i < allCompiledLines.length; i++) {
    const ln = allCompiledLines[i];
    const l = ln.raw;
    const trigT = ln.t;
    const nextLn = allCompiledLines[i + 1];
    const slotEnd = nextLn ? Math.max(trigT + 0.3, nextLn.t) : 9999;

    const iconId = l.scene?.icon?.trim();
    if (iconId && iconId !== "same") {
      activeScene = {
        t: trigT,
        end: r3(slotEnd),
        icon: iconId,
        iconUrl: iconUrl(iconId),
        label: l.scene?.label?.trim() ?? "",
      };
      if (l.badge?.trim()) {
        activeScene.badge = { t: trigT, text: l.badge.trim() };
      }
      scenes.push(activeScene);
    } else if (iconId === "same") {
      if (activeScene) {
        activeScene.end = r3(slotEnd);
        if (l.badge?.trim()) {
          activeScene.badge = { t: trigT, text: l.badge.trim() };
        }
      }
    } else {
      activeScene = null;
    }

    if (l.pose) poses.push({ t: trigT, pose: l.pose });
  }

  return {
    channelName: p.channelName,
    introDuration: p.timing.intro,
    audioDuration,
    holdAfterAudio: p.timing.hold,
    fadeDuration: p.timing.fade,
    total: totalDuration(p),
    env,
    cards: out,
    scenes,
    poses,
  };
}

/* ------------------------------------------------------------------ */
/* Automatic segmentation                                               */
/* ------------------------------------------------------------------ */

const MAX_LINE_CHARS = 30;
const MAX_LINE_WORDS = 6;
const MAX_CARD_LINES = 3;

/** Infer a natural character hand pose from Arabic line meaning. */
export function inferPose(text: string, isFirstInCard: boolean, prevPose?: PoseId): PoseId | undefined {
  const bare = normalize(text);
  let candidate: PoseId | undefined;
  if (/(روي|رواه|مصنف|كتاب|طبري|بخاري|مسلم|تفسير|حديث|قران)/.test(bare)) {
    candidate = "book";
  } else if (/(قال الله|والذي|لا اله|تعالي|سبحانه|السماء|ربنا)/.test(bare)) {
    candidate = "point_up";
  } else if (/(يحب|قلب|ظن|مؤمن|احسنوا|محسنين|رحم|نيه|صدر)/.test(bare)) {
    candidate = "heart";
  } else if (isFirstInCard) {
    candidate = "present";
  }
  if (candidate && candidate !== prevPose) return candidate;
  return undefined;
}

/** Auto-assign natural character poses across all cards. */
export function autoAssignPoses(cards: Card[]): Card[] {
  let prev: PoseId | undefined;
  return cards.map((c, ci) => ({
    ...c,
    lines: c.lines.map((l, li) => {
      const pose = l.pose ?? inferPose(l.text, li === 0, prev) ?? (ci === 0 && li === 0 ? "present" : undefined);
      if (pose) prev = pose;
      return { ...l, pose };
    }),
  }));
}

/** Vocalize all unvocalized words across all cards/headers/footers. */
export function vocalizeCards(cards: Card[]): Card[] {
  return cards.map(c => ({
    ...c,
    header: c.header ? vocalizeText(c.header) : c.header,
    footer: c.footer ? vocalizeText(c.footer) : c.footer,
    lines: c.lines.map(l => ({ ...l, text: vocalizeText(l.text) })),
  }));
}

/** Build cards straight from Whisper words using pauses and length limits. */
export function autoCards(words: TimedWord[]): Card[] {
  if (!words.length) return [];
  const lines: { words: TimedWord[]; gapAfter: number }[] = [];
  let cur: TimedWord[] = [];
  const flush = (gap: number) => { if (cur.length) lines.push({ words: cur, gapAfter: gap }); cur = []; };
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const gap = next ? next.s - w.e : 99;
    const chars = cur.map(x => x.w.trim()).join(" ").length;
    const endsSentence = /[.،,:؛!?؟]$/.test(w.w.trim());
    if (!next || gap > 0.35 || endsSentence || cur.length >= MAX_LINE_WORDS || chars >= MAX_LINE_CHARS) flush(gap);
  });

  const cards: Card[] = [];
  let card: Line[] = [];
  lines.forEach((ln, i) => {
    const first = ln.words[0], last = ln.words[ln.words.length - 1];
    const rawText = ln.words.map(w => w.w.trim()).join(" ");
    card.push({ id: uid(), text: vocalizeText(rawText), start: r3(first.s), end: r3(last.e) });
    const isLast = i === lines.length - 1;
    if (isLast || card.length >= MAX_CARD_LINES || ln.gapAfter > 0.6) { cards.push({ id: uid(), lines: card }); card = []; }
  });
  return autoAssignPoses(cards);
}

/**
 * Build cards from text pasted by the user (with tashkeel):
 *  - every line of text becomes a subtitle line
 *  - an empty line starts a new card
 *  - a line starting with "#" is the card header (display only, not spoken)
 *  - a line starting with ">" is the card footer (e.g. the source), display only
 * Timings come from aligning the pasted words to the Whisper words.
 */
export function cardsFromText(text: string, words: TimedWord[], audioDuration: number): Card[] {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/).map(b => b.split("\n").map(s => s.trim()).filter(Boolean)).filter(b => b.length);
  type Draft = { header?: string; footer?: string; lines: string[] };
  const drafts: Draft[] = blocks.map(b => {
    const d: Draft = { lines: [] };
    for (const l of b) {
      if (l.startsWith("#")) d.header = l.replace(/^#+\s*/, "");
      else if (l.startsWith(">")) d.footer = l.replace(/^>+\s*/, "");
      else d.lines.push(l);
    }
    return d;
  }).filter(d => d.lines.length);

  // align all spoken tokens against all words at once
  const allLines = drafts.flatMap(d => d.lines);
  const tokensPerLine = allLines.map(l => tokenize(l));
  const flat = tokensPerLine.flat();
  const match = alignTokens(flat, words);

  // first matched word of each line → line start
  let k = 0;
  const starts: (number | null)[] = [];
  const ends: (number | null)[] = [];
  for (const toks of tokensPerLine) {
    let s: number | null = null, e: number | null = null;
    for (let j = 0; j < toks.length; j++, k++) {
      const m = match[k];
      if (m >= 0) { if (s === null) s = words[m].s; e = words[m].e; }
    }
    starts.push(s); ends.push(e);
  }
  // fill unknown starts by interpolation
  const n = allLines.length;
  for (let i = 0; i < n; i++) {
    if (starts[i] !== null) continue;
    let a = i - 1; while (a >= 0 && starts[a] === null) a--;
    let b = i + 1; while (b < n && starts[b] === null) b++;
    const tA = a >= 0 ? (starts[a] as number) : 0;
    const tB = b < n ? (starts[b] as number) : audioDuration;
    starts[i] = tA + ((tB - tA) * (i - a)) / (b - a);
  }

  let li = 0;
  return drafts.map(d => ({
    id: uid(),
    header: d.header,
    footer: d.footer,
    lines: d.lines.map(text => {
      const i = li++;
      const start = r3(starts[i] as number);
      const nextStart = i + 1 < n ? (starts[i + 1] as number) : audioDuration;
      const end = r3(Math.max(start + 0.3, Math.min(nextStart, ends[i] ?? nextStart)));
      return { id: uid(), text, start, end };
    }),
  }));
}

/** Keep per-line extras (scene / badge / pose / accent) when cards are rebuilt from text. */
export function carryOver(oldCards: Card[], newCards: Card[]): Card[] {
  const oldLines = oldCards.flatMap(c => c.lines).filter(l => l.scene || l.badge || l.pose || l.accent);
  if (!oldLines.length) return newCards;
  const newLines = newCards.flatMap(c => c.lines);
  for (const o of oldLines) {
    let best: Line | null = null, d = 0.8;
    for (const n of newLines) { const dd = Math.abs(n.start - o.start); if (dd < d) { d = dd; best = n; } }
    if (best) Object.assign(best, { scene: o.scene, badge: o.badge, pose: o.pose, accent: o.accent });
  }
  return newCards;
}

/** Plain text (one line per subtitle line, blank line between cards, "#" header, ">" footer) from cards. */
export function cardsToText(cards: Card[]): string {
  return cards
    .map(c => [c.header ? `# ${c.header}` : null, ...c.lines.map(l => l.text), c.footer ? `> ${c.footer}` : null].filter(Boolean).join("\n"))
    .join("\n\n");
}

/** Quick quality hint: share of words in the text that matched the audio. */
export function matchRatio(text: string, words: TimedWord[]): number {
  const toks = text.split(/\n/).filter(l => !/^\s*[#>]/.test(l)).join(" ").split(/\s+/).filter(t => normalize(t));
  if (!toks.length || !words.length) return 0;
  const m = alignTokens(toks, words);
  return m.filter(x => x >= 0).length / toks.length;
}

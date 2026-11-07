// Automatic Arabic vocalization (Tashkeel) for unvocalized words in Hadith/Tafsir texts.
// Preserves words that already carry harakat and vocalizes unvocalized words using
// context rules + a classical Arabic / Hadith lexicon + morphological patterns.

const HARAKAT_RE = /[\u064B-\u0652\u0670]/;

/** Returns true if a word already has at least one Arabic diacritic mark. */
export function hasTashkeel(word: string): boolean {
  return HARAKAT_RE.test(word);
}

/** Multi-word phrase replacements (fixes common Whisper unvocalized phrases & homophones). */
const PHRASE_RULES: Array<[RegExp, string]> = [
  [/قال\s+الله\s+تعالى/g, "قَالَ اللَّهُ تَعَالَى:"],
  [/قال\s+رسول\s+الله\s+صلى\s+الله\s+عليه\s+وسلم/g, "قَالَ رَسُولُ اللَّهِ ﷺ:"],
  [/صلى\s+الله\s+عليه\s+وسلم/g, "صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ"],
  [/رضي\s+الله\s+عنهما/g, "رَضِيَ اللَّهُ عَنْهُمَا"],
  [/رضي\s+الله\s+عنهم/g, "رَضِيَ اللَّهُ عَنْهُمْ"],
  [/رضي\s+الله\s+عنها/g, "رَضِيَ اللَّهُ عَنْهَا"],
  [/رضي\s+الله\s+عنه/g, "رَضِيَ اللَّهُ عَنْهُ"],
  [/رحمه\s+الله\s+تعالى/g, "رَحِمَهُ اللَّهُ تَعَالَى"],
  [/رحمه\s+الله/g, "رَحِمَهُ اللَّهُ"],
  [/عز\s+وجل/g, "عَزَّ وَجَلَّ"],
  [/سبحانه\s+وتعالى/g, "سُبْحَانَهُ وَتَعَالَى"],
  [/أحسنوا\s+أظن\s+بالله/g, "أَحْسِنُوا الظَّنَّ بِاللَّهِ"],
  [/أَحْسِنُوا\s+أظن\s+بالله/g, "أَحْسِنُوا الظَّنَّ بِاللَّهِ"],
  [/احسنوا\s+الظن\s+بالله/g, "أَحْسِنُوا الظَّنَّ بِاللَّهِ"],
  [/أحسنوا\s+الظن\s+بالله/g, "أَحْسِنُوا الظَّنَّ بِاللَّهِ"],
  [/حسن\s+الظن\s+بالله/g, "حُسْنُ الظَّنِّ بِاللَّهِ"],
  [/روى\s+الطبري/g, "رَوَى الطَّبَرِيُّ"],
  [/عن\s+عكريمة/g, "عَنْ عِكْرِمَةَ"],
  [/عن\s+عكرمة/g, "عَنْ عِكْرِمَةَ"],
  [/ابن\s+أبي\s+شيبة/g, "ابْنُ أَبِي شَيْبَةَ"],
  [/ابن\s+مسعود/g, "ابْنِ مَسْعُودٍ"],
  [/ابن\s+عباس/g, "ابْنِ عَبَّاسٍ"],
  [/ابن\s+عمر/g, "ابْنِ عُمَرَ"],
  [/أبي\s+هريرة/g, "أَبِي هُرَيْرَةَ"],
  [/رواه\s+البخاري\s+ومسلم/g, "رَوَاهُ الْبُخَارِيُّ وَمُسْلِمٌ"],
  [/رواه\s+البخاري/g, "رَوَاهُ الْبُخَارِيُّ"],
  [/رواه\s+مسلم/g, "رَوَاهُ مُسْلِمٌ"],
  [/لا\s+إله\s+غيره/g, "لَا إِلَٰهَ غَيْرُهُ"],
  [/لا\s+إله\s+إلا\s+الله/g, "لَا إِلَٰهَ إِلَّا اللَّهُ"],
];

/** Classical Arabic / Hadith / Tafsir word dictionary (bare word -> vocalized). */
const LEXICON: Record<string, string> = {
  // Verbs & particles
  "قال": "قَالَ",
  "قالت": "قَالَتْ",
  "قالوا": "قَالُوا",
  "يقول": "يَقُولُ",
  "قيل": "قِيلَ",
  "روى": "رَوَى",
  "رواه": "رَوَاهُ",
  "رويناه": "رَوَيْنَاهُ",
  "حدثنا": "حَدَّثَنَا",
  "أخبرنا": "أَخْبَرَنَا",
  "سمعت": "سَمِعْتُ",
  "سمع": "سَمِعَ",
  "عن": "عَنْ",
  "في": "فِي",
  "من": "مِنْ",
  "إلى": "إِلَى",
  "الي": "إِلَى",
  "على": "عَلَى",
  "علي": "عَلَى",
  "أن": "أَنْ",
  "إن": "إِنَّ",
  "إلا": "إِلَّا",
  "الا": "إِلَّا",
  "لا": "لَا",
  "ما": "مَا",
  "لم": "لَمْ",
  "لن": "لَنْ",
  "قد": "قَدْ",
  "لقد": "لَقَدْ",
  "ثم": "ثُمَّ",
  "أو": "أَوْ",
  "بل": "بَلْ",
  "حتى": "حَتَّى",
  "إذا": "إِذَا",
  "إذ": "إِذْ",
  "لو": "لَوْ",
  "لولا": "لَوْلَا",
  "كل": "كُلَّ",
  "بعض": "بَعْضُ",
  "غير": "غَيْرِ",
  "غيره": "غَيْرُهُ",
  "بيده": "بِيَدِهِ",
  "بأيديكم": "بِأَيْدِيكُمْ",
  "ذلك": "ذَٰلِكَ",
  "هذا": "هَٰذَا",
  "هذه": "هَٰذِهِ",
  "الذي": "الَّذِي",
  "والذي": "وَالَّذِي",
  "التي": "الَّتِي",
  "الذين": "الَّذِينَ",
  "هو": "هُوَ",
  "هي": "هِيَ",
  "هم": "هُمْ",
  "أنت": "أَنْتَ",
  "أنتم": "أَنْتُمْ",
  "أنا": "أَنَا",
  "نحن": "نَحْنُ",
  "كان": "كَانَ",
  "كانت": "كَانَتْ",
  "كانوا": "كَانُوا",
  "يكون": "يَكُونُ",
  "ليس": "لَيْسَ",

  // Divine names & religious terms
  "الله": "اللَّهِ",
  "بالله": "بِاللَّهِ",
  "لله": "لِلَّهِ",
  "والله": "وَاللَّهِ",
  "تالله": "تَاللَّهِ",
  "تعالى": "تَعَالَى",
  "سبحانه": "سُبْحَانَهُ",
  "رب": "رَبِّ",
  "ربنا": "رَبَّنَا",
  "ربي": "رَبِّي",
  "إله": "إِلَٰهَ",
  "رسول": "رَسُولُ",
  "النبي": "النَّبِيُّ",
  "صلى": "صَلَّى",
  "عليه": "عَلَيْهِ",
  "وسلم": "وَسَلَّمَ",
  "رضي": "رَضِيَ",
  "عنه": "عَنْهُ",
  "عنها": "عَنْهَا",
  "عنهما": "عَنْهُمَا",
  "عنهم": "عَنْهُمْ",
  "رحمه": "رَحِمَهُ",
  "المؤمن": "الْمُؤْمِنُ",
  "المؤمنين": "الْمُؤْمِنِينَ",
  "المحسنين": "الْمُحْسِنِينَ",
  "مؤمن": "مُؤْمِنٌ",
  "عبد": "عَبْدٌ",
  "عباد": "عِبَادِ",
  "الخير": "الْخَيْرِ",
  "خير": "خَيْرٌ",
  "شيء": "شَيْءٍ",
  "سبيل": "سَبِيلِ",
  "التهلكة": "التَّهْلُكَةِ",
  "الظن": "الظَّنَّ",
  "أظن": "الظَّنَّ",
  "ظنه": "ظَنَّهُ",
  "أحسن": "أَحْسَنَ",
  "أحسنوا": "أَحْسِنُوا",
  "وأحسنوا": "وَأَحْسِنُوا",
  "يحسن": "يُحْسِنُ",
  "يحب": "يُحِبُّ",
  "وأنفقوا": "وَأَنْفِقُوا",
  "أنفقوا": "أَنْفِقُوا",
  "ولا": "وَلَا",
  "تلقوا": "تُلْقُوا",
  "يبركم": "يُبِرَّكُمْ",
  "أعطاه": "أَعْطَاهُ",
  "أعطي": "أُعْطِيَ",
  "أفضل": "أَفْضَلَ",
  "فإن": "فَإِنَّ",
  "وإن": "وَإِنَّ",
  "إنما": "إِنَّمَا",
  "الأعمال": "الْأَعْمَالُ",
  "بالنيات": "بِالنِّيَّاتِ",
  "تفسير": "تَفْسِيرِ",
  "تفسيره": "تَفْسِيرِهِ",
  "تفسيرها": "تَفْسِيرِهَا",
  "الآية": "الْآيَةِ",
  "الحديث": "الْحَدِيثِ",
  "مصنفه": "مُصَنَّفِهِ",
  "المصنف": "الْمُصَنَّفِ",
  "صحيحه": "صَحِيحِهِ",
  "الصحيح": "الصَّحِيحِ",

  // Famous scholars & narrators
  "الطبري": "الطَّبَرِيُّ",
  "عكرمة": "عِكْرِمَةَ",
  "عكريمة": "عِكْرِمَةَ",
  "البخاري": "الْبُخَارِيُّ",
  "مسلم": "مُسْلِمٌ",
  "الترمذي": "التِّرْمِذِيُّ",
  "أحمد": "أَحْمَدُ",
  "مالك": "مَالِكٌ",
  "الشافعي": "الشَّافِعِيُّ",
  "مجاهد": "مُجَاهِدٌ",
  "قتادة": "قَتَادَةَ",
  "الحسن": "الْحَسَنِ",
  "سفيان": "سُفْيَانَ",
  "ابن": "ابْنُ",
  "بن": "بْنِ",
  "أبي": "أَبِي",
  "أبو": "أَبُو",
  "شيبة": "شَيْبَةَ",
  "مسعود": "مَسْعُودٍ",
  "عباس": "عَبَّاسٍ",
  "عمر": "عُمَرَ",
  "هريرة": "هُرَيْرَةَ",
};

/** Vocalize a single token if it lacks harakat, preserving leading/trailing punctuation. */
function vocalizeToken(token: string, prevBare?: string): string {
  const m = token.match(/^([^\p{L}\p{M}]*)([\p{L}\p{M}]+)([^\p{L}\p{M}]*)$/u);
  if (!m) return token;
  const [, lead, core, trail] = m;

  // Already has tashkeel -> keep as-is
  if (hasTashkeel(core)) return token;

  const bare = core.replace(/[\u0640]/g, "");

  // Context rule: "الله" after "قال" / "إن" / etc.
  if (bare === "الله") {
    if (prevBare === "قال" || prevBare === "كان" || prevBare === "يرحمك" || prevBare === "بارك") {
      return `${lead}اللَّهُ${trail}`;
    }
    if (prevBare === "إن" || prevBare === "أن" || prevBare === "سأل" || prevBare === "اتقوا" || prevBare === "أطاع") {
      return `${lead}اللَّهَ${trail}`;
    }
    return `${lead}اللَّهِ${trail}`;
  }

  if (LEXICON[bare]) {
    return `${lead}${LEXICON[bare]}${trail}`;
  }

  // Try stripping common 1-letter proclitics (و، ف، ب، ل، ك) if the stem is in LEXICON
  if (bare.length > 3) {
    const first = bare[0];
    const rest = bare.slice(1);
    if ((first === "و" || first === "ف") && LEXICON[rest]) {
      return `${lead}${first}\u064E${LEXICON[rest]}${trail}`;
    }
    if (first === "ب" && LEXICON[rest]) {
      return `${lead}بِ${LEXICON[rest]}${trail}`;
    }
    if (first === "ل" && LEXICON[rest]) {
      return `${lead}لِ${LEXICON[rest]}${trail}`;
    }
  }

  // Fallback morphological heuristics for remaining unvocalized words:
  // Add definite article sukun/fatha or basic initial vowel so no word looks completely bare
  if (bare.startsWith("ال") && bare.length >= 4) {
    return `${lead}الْ${bare.slice(2)}${trail}`;
  }

  return token;
}

/**
 * Vocalizes any unvocalized words in Arabic text while keeping existing Tashkeel intact.
 */
export function vocalizeText(input: string): string {
  if (!input.trim()) return input;

  let text = input;
  for (const [pattern, replacement] of PHRASE_RULES) {
    text = text.replace(pattern, replacement);
  }

  // Process line by line to preserve newlines and card structure (#, >)
  return text
    .split("\n")
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      let prefix = "";
      let body = trimmed;
      if (trimmed.startsWith("#") || trimmed.startsWith(">")) {
        prefix = trimmed[0] + " ";
        body = trimmed.slice(1).trim();
      }
      const rawTokens = body.split(/\s+/);
      let prevBare: string | undefined;
      const outTokens = rawTokens.map(tok => {
        const res = vocalizeToken(tok, prevBare);
        prevBare = tok.replace(/[^\p{L}]|\p{M}/gu, "");
        return res;
      });
      return prefix + outTokens.join(" ");
    })
    .join("\n");
}

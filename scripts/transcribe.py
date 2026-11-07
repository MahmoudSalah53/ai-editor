"""Transcribe a voice file with faster-whisper and write transcript.json.
usage: transcribe.py <audio> <out.json> [model] [prompt_hint]
model: a faster-whisper model name (e.g. large-v3-turbo, small) or a local folder.
"""
import json, os, re, sys, time, datetime

audio, out = sys.argv[1], sys.argv[2]
model_name = sys.argv[3] if len(sys.argv) > 3 else "large-v3-turbo"
prompt_hint = sys.argv[4] if len(sys.argv) > 4 else ""

WORD_FIXES = {
    "عكريمة": "عِكْرِمَةَ",
    "عكرمة": "عِكْرِمَةَ",
    "بأيديكم": "بِأَيْدِيكُمْ",
    "الطبري": "الطَّبَرِيُّ",
    "يبركم.": "يُبِرَّكُمْ.",
    "يبركم": "يُبِرَّكُمْ",
    "تفسيرها": "تَفْسِيرِهَا",
}


def write(state):
    tmp = out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, out)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


try:
    from faster_whisper import WhisperModel

    def load(offline):
        if offline:
            os.environ["HF_HUB_OFFLINE"] = "1"
        else:
            os.environ.pop("HF_HUB_OFFLINE", None)
            os.environ["HF_HUB_DISABLE_XET"] = "1"
        return WhisperModel(model_name, device="cpu", compute_type="float32")

    try:
        model = load(offline=True)      # use the cached model without touching the network
    except Exception:
        model = load(offline=False)     # first run: download it

    base_prompt = (
        "قَالَ اللَّهُ تَعَالَى: قَالَ رَسُولُ اللَّهِ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ: "
        "رَوَى الطَّبَرِيُّ وَابْنُ أَبِي شَيْبَةَ عَنْ عِكْرِمَةَ وَابْنِ مَسْعُودٍ رَضِيَ اللَّهُ عَنْهُ قَالَ: "
        "أَحْسِنُوا الظَّنَّ بِاللَّهِ يُبِرَّكُمْ."
    )
    full_prompt = f"{prompt_hint.strip()} {base_prompt}".strip() if prompt_hint.strip() else base_prompt
    hotwords = "عكرمة الطبري تفسيرها الظن بالله يبركم مصنفه ابن أبي شيبة ابن مسعود رضي الله عنه"
    if prompt_hint.strip():
        hotwords = prompt_hint.strip() + " " + hotwords

    t0 = time.time()
    segments, info = model.transcribe(
        audio,
        language="ar",
        word_timestamps=True,
        beam_size=5,
        temperature=0.0,
        condition_on_previous_text=False,
        vad_filter=False,
        hotwords=hotwords[:400],
        initial_prompt=full_prompt[:500],
    )
    words, texts = [], []
    for s in segments:
        texts.append(s.text.strip())
        for w in s.words or []:
            tok = w.word.strip()
            tok = WORD_FIXES.get(tok, tok)
            words.append({"w": tok, "s": round(w.start, 3), "e": round(w.end, 3)})

    # Contextual two-word fix: "أحسنوا أظن" -> "أَحْسِنُوا الظَّنَّ"
    for i in range(len(words)):
        bare = re.sub(r"[\u064B-\u0652\u0670]", "", words[i]["w"])
        prev_bare = re.sub(r"[\u064B-\u0652\u0670]", "", words[i - 1]["w"]) if i > 0 else ""
        if bare == "أظن" and prev_bare in ("أحسنوا", "احسنوا", "يحسن", "تحسنوا"):
            words[i]["w"] = "الظَّنَّ"

    full_text = " ".join(w["w"] for w in words)
    write({"status": "done", "model": model_name, "words": words, "text": full_text,
           "updatedAt": now(), "seconds": round(time.time() - t0, 1)})
except Exception as e:  # noqa: BLE001
    write({"status": "error", "model": model_name, "words": [], "text": "", "error": str(e)[-600:], "updatedAt": now()})
    sys.exit(1)

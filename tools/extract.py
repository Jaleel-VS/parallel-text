#!/usr/bin/env python3
"""Extract the parallel-text stories from the EPUB into site/data.js.

Usage: python3 tools/extract.py path/to/book.epub

The EPUB holds each story twice: a parallel chapter (Spanish line in
p.p2, English translation in p.p3) and a Spanish-only chapter whose
paragraphs we use to regroup the sentence pairs into paragraphs.
"""
import bisect
import html
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Copies of the audiobook (originally http://www.paralleltext.eu/ES/11/, HTTP only),
# served over HTTPS from S3 via CloudFront.
AUDIO_BASE = "https://da8wz18u6jpdv.cloudfront.net/audio/"

# (parallel chapter, Spanish-only chapter, audio file, slug)
STORIES = [
    ("body5", "body17", "Tomatima.mp3", "la-tomatina"),
    ("body6", "body19", "Tiendas.mp3", "tiendas"),
    ("body7", "body18", "Comer.mp3", "comer"),
    ("body8", "body20", "Cine.mp3", "cine"),
    ("body9", "body21", "Estados.mp3", "estados-unidos"),
    ("body10", "body22", "Online.mp3", "cita-online"),
    ("body11", "body24", "Supermercado.mp3", "supermercado"),
    ("body12", "body25", "PorQueYo.mp3", "por-que-yo"),
]

P_RE = re.compile(r'<p class="(p\d)">(.*?)</p>', re.S)
NOTE_MARK = re.compile(r"^\*?(\d+)\*?$")


def text(fragment):
    t = html.unescape(re.sub(r"<[^>]+>", "", fragment))
    return re.sub(r"\s+", " ", t.replace("\u00a0", " ")).strip()


def paragraphs(xhtml):
    return [(cls, t) for cls, frag in P_RE.findall(xhtml) if (t := text(frag))]


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if c.isalnum())


def parse_parallel(xhtml):
    ps = paragraphs(xhtml)
    (_, title_es), (_, title_en) = ps[0], ps[1]
    pairs, notes, note_no = [], [], None
    i = 2
    while i < len(ps):
        cls, t = ps[i]
        if cls == "p2" and (m := NOTE_MARK.match(t)):
            note_no = int(m.group(1))
            i += 1
            continue
        nxt = ps[i + 1] if i + 1 < len(ps) else None
        if cls != "p2" or not nxt or nxt[0] != "p3":
            raise ValueError(f"unpaired line: {t!r}")
        pair = {"es": t, "en": nxt[1]}
        if note_no is not None:
            notes.append({"n": note_no, **pair})
            note_no = None
        elif notes:
            raise ValueError(f"story text after footnotes: {t!r}")
        else:
            pairs.append(pair)
        i += 2
    return title_es, title_en, pairs, notes


def group(pairs, spanish_xhtml):
    """Group sentence pairs to match the Spanish-only chapter's paragraphs.

    The two versions differ by small edits, so each sentence is located in
    the Spanish-only text by its full text, else its head, else its tail;
    an unlocatable sentence stays in the previous sentence's paragraph.
    """
    targets = [norm(t) for cls, t in paragraphs(spanish_xhtml)[1:]
               if not NOTE_MARK.match(t)]
    starts, pos = [], 0
    for t in targets:
        starts.append(pos)
        pos += len(t)
    whole = "".join(targets)

    def para_at(offset):
        return bisect.bisect_right(starts, offset) - 1

    groups, cursor, current = [], 0, -1
    for p in pairs:
        s = norm(p["es"])
        found = None
        probes = [(s, 0)]
        if len(s) > 20:
            probes += [(s[:20], 0), (s[-20:], len(s) - 20)]
        for probe, shift in probes:
            at = whole.find(probe, cursor)
            if at >= 0:
                found = max(at - shift, cursor)
                cursor = at + len(probe)
                break
        idx = current if found is None else max(current, para_at(found))
        if idx != current or not groups:
            groups.append([])
            current = idx
        groups[-1].append(p)
    return groups


def main(epub):
    z = zipfile.ZipFile(epub)
    read = lambda n: z.read(f"OPS/{n}.xhtml").decode("utf-8")
    stories = []
    for par, solo, audio, slug in STORIES:
        title_es, title_en, pairs, notes = parse_parallel(read(par))
        paras = group(pairs, read(solo))
        stories.append({
            "slug": slug,
            "titleEs": title_es,
            "titleEn": title_en,
            "audio": AUDIO_BASE + audio,
            "paragraphs": paras,
            "notes": notes,
        })
        print(f"{slug:16} {len(pairs):3} sentences  {len(paras):3} paragraphs  {len(notes)} notes")
    out = ROOT / "site" / "data.js"
    out.write_text("window.BOOK = " + json.dumps({
        "title": "Learn Spanish – Parallel Text: Easy Stories",
        "publisher": "Polyglot Planet Publishing",
        "copyright": "Copyright © 2015 Polyglot Planet. All rights reserved.",
        "stories": stories,
    }, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    (ROOT / "site" / "cover.jpg").write_bytes(z.read("OPS/images/cover.jpg"))
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1])

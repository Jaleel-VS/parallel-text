# Parallel Text reader

A static website for reading *Learn Spanish – Parallel Text: Easy Stories*
(Polyglot Planet Publishing) with Spanish and English side by side.

## Features

- All 8 stories, each with Spanish and English in paragraph-aligned columns.
  Hovering or tapping a sentence highlights its translation.
- **Español** / **English** toggles. Hide either language to test yourself,
  then tap a sentence to peek at its translation. Shortcuts: `S`, `E`.
- Two layouts when both languages are on: *Side by side* (the default on wide
  screens) and *Line by line* (the default on phones). Shortcut: `L`.
- The book's audiobook track for each story, with a playback-speed control.
- Text size, dark mode, "mark as read", and the reading position in each
  story are saved in the browser.
- Footnotes from the book, in both languages.

## Layout

```
site/          the website, served as-is (no build step)
  index.html
  app.js
  styles.css
  data.js      generated: story text
  cover.jpg    generated: from the EPUB
  fonts/       Newsreader and Instrument Sans, latin subset (SIL OFL)
tools/
  extract.py   rebuilds data.js and cover.jpg from the EPUB
vercel.json    tells Vercel to serve site/
```

## Run locally

```sh
python3 -m http.server 8000 -d site
# open http://localhost:8000
```

You can also open `site/index.html` directly from disk.

## Regenerate the text from the EPUB

```sh
python3 tools/extract.py path/to/book.epub
```

Requires only Python 3's standard library. The script reads the parallel
chapters (Spanish line, then its English translation) and takes the
paragraph breaks from the book's Spanish-only chapters. It fails loudly if
a Spanish line has no translation.

## Deploy

Live at **https://parallel.jaleel.me**.

| Part | Where |
| --- | --- |
| Site | Vercel project `parallel-text` (scope `jaleelvs-projects`), connected to GitHub `Jaleel-VS/parallel-text`; serves `site/` with no build step |
| Domain | GoDaddy DNS: `CNAME parallel → 9775b04bf0a43718.vercel-dns-017.com.` |
| Audio | Private S3 bucket (key prefix `audio/`), served over HTTPS by a CloudFront distribution (`da8wz18u6jpdv.cloudfront.net`) through origin access control |

Every push to `main` deploys to production. Other branches get preview
deployments. To deploy from your machine without pushing:

```sh
vercel deploy --prod --yes --scope jaleelvs-projects
```

The publisher's own audio host, `http://www.paralleltext.eu/ES/11/`, serves
plain HTTP only. Browsers block HTTP audio on an HTTPS page, so the MP3s
are copied to S3. To replace or add tracks:

```sh
# with credentials for the AWS account that owns the bucket
aws s3 cp Track.mp3 s3://<bucket>/audio/ \
  --content-type audio/mpeg --cache-control "public, max-age=31536000, immutable"
```

Files are cached for a year. To change a file that keeps its name, run
`aws cloudfront create-invalidation --distribution-id <distribution-id> --paths '/audio/*'`.

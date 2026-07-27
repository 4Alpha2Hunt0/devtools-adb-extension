# Obsidian Inbox Watcher

A standalone Node.js tool (no Obsidian API, no Electron) that watches an
"Inbox" folder in your vault. Drop any file in — a note, a PDF, a Word doc,
an image, a screenshot — and it uses Claude to summarize and classify it,
then files a new note into `Tools/`, `Projects/`, or `Notes/` and archives
the original into `Attachments/`. Nothing is ever deleted.

This is separate from the `obsidian-brain/plugin` Obsidian plugin. That
plugin logs tool usage *you* trigger from inside Obsidian; this tool reacts
to files showing up on disk and calls a real LLM to figure out what they
are. Tool notes it creates use the same frontmatter schema as the plugin
(`times_used`, `first_used`, `last_used`), so the plugin's **Refresh tools
dashboard** command picks them up correctly.

## Requires

- Node.js
- An Anthropic API key (this makes real, billed API calls — see
  [console.anthropic.com](https://console.anthropic.com) for keys and pricing)

## Setup

```bash
cd obsidian-brain/inbox-watcher
npm install
cp .env.example .env
```

Edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
VAULT_PATH=/absolute/path/to/obsidian-brain/vault
INBOX_DIR=Inbox
ATTACHMENTS_DIR=Attachments
MODEL=claude-sonnet-5
```

`VAULT_PATH` should point at the same `vault/` folder you opened in
Obsidian. `INBOX_DIR` and `ATTACHMENTS_DIR` are created automatically if
they don't exist.

## Run it

```bash
npm start
```

Leave it running, then drop files into the vault's `Inbox/` folder (via
Finder/Explorer, or by dragging them into that folder from Obsidian). Each
one gets:

1. **Extracted** — `.md`/`.txt`/`.csv`/`.json` read directly, `.pdf` via
   `unpdf` (built on Mozilla's `pdfjs-dist`), `.docx` via `mammoth`, images
   (`.png`/`.jpg`/`.webp`/`.gif`) sent to Claude directly as an image.
2. **Classified** — Claude returns a title, a 2-4 sentence summary, tags,
   and a category (`tool` / `project` / `note`).
3. **Filed** — a new note is written to the matching folder, and the
   original file is moved into `Attachments/` (renamed with a numeric
   suffix if there's already a file with that name — never overwritten).

If processing a file fails (bad API key, rate limit, unsupported format,
network error), it's logged to the console and the file is **left in the
inbox** untouched — nothing is silently lost. Fix the issue and restart the
watcher to retry it.

## Supported file types

| Type | Extensions | How |
|---|---|---|
| Text | `.md`, `.txt`, `.csv`, `.json`, `.log` | read directly |
| PDF | `.pdf` | text extracted via `unpdf` (`pdfjs-dist`) |
| Word | `.docx` | text extracted via `mammoth` |
| Images | `.png`, `.jpg`/`.jpeg`, `.webp`, `.gif` | sent to Claude as an image |
| Anything else | — | read as UTF-8 text if it decodes cleanly, otherwise rejected |

## Cost note

Every dropped file is one Claude API call. Content is truncated to ~20,000
characters before sending to keep individual calls bounded, but volume is
still on you — this is not free, and there's no batching or caching.

## Testing without an API key

`npm test` runs `test/run-test.js`, which exercises the whole pipeline
(extraction routing, classification response parsing including malformed
JSON, and vault filing/collision handling) against a mocked Claude client —
no API key or network access required.

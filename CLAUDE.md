# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository structure

This repo actually contains two unrelated projects:

1. **The Firefox DevTools ADB Extension** (`extension/`, `Makefile`, `dist/`, `template-*.json`) — the
   original purpose of this repo. A Firefox extension that bundles per-platform `adb` binaries so
   DevTools can do remote debugging of Firefox/GeckoView on Android over USB.
2. **`obsidian-brain/`** — an unrelated personal Obsidian vault + plugin + Node tool, scaffolded inside
   this repo because the session that created it didn't have permission to create a new GitHub repo. It
   is self-contained and does not touch the extension's build (`Makefile`, `extension/`, `dist/`) at all.
   See `obsidian-brain/README.md` for why it lives here.

Treat these as independent codebases sharing a repo. Changes to one should not incidentally affect the other.

## Part 1: ADB Extension

### Architecture

- `extension/adb.json` maps OS (`Linux`/`Darwin`/`WINNT`) and architecture (`x86`/`x86_64`) to the
  relative path(s) of the `adb` binary/DLLs to bundle for that platform.
- `extension/{linux,linux64,mac64,win32}/` each hold a prebuilt `adb` binary (plus Windows DLLs and a
  per-vendor LICENSE/README) for that platform.
- `extension/template-manifest.json` is a `manifest.json` template with `@@ARCH@@`, `@@VERSION@@`, and
  `@@UPDATE_URL@@` placeholders substituted at build time.
- `template-update.json` is the analogous template for each arch's `update.json` (the Firefox add-on
  auto-update manifest), with `@@VERSION@@` and `@@UPDATE_LINK@@` placeholders.
- There is no application source code to build/lint/test here — the "build" is just templating +
  zipping prebuilt binaries into one XPI per architecture.

### Build (packaging a release)

```bash
make package   # builds dist/{linux,linux64,mac64,win32}/*.xpi + update.json, after cleaning dist/
make clean     # removes the per-arch dist/ folders
```

`make package` reads `VERSION` from the `Makefile` and, for each arch in `ARCHS`, generates a temporary
`extension/manifest.json` from `template-manifest.json`, zips it with that arch's binaries and
`adb.json` into `dist/<arch>/adb-extension-<version>.<index>-<arch>.xpi`, then deletes the temporary
manifest and writes `dist/<arch>/update.json` from `template-update.json`. Each arch gets a distinct
4th version component (`.0`, `.1`, `.2`, `.3` for linux/linux64/mac64/win32 respectively) because AMO
requires strictly increasing versions across unlisted uploads of the "same" release.

### Release process

Full manual release steps (bumping `VERSION`, uploading unlisted XPIs to AMO in arch order, renaming
signed XPIs, and uploading to the FTP server alongside "latest" copies) are documented in `README.md`.
When asked to cut a release, follow that doc precisely — the AMO upload order and file renaming are
easy to get wrong.

## Part 2: obsidian-brain

Three independent pieces under `obsidian-brain/`:

- **`vault/`** — the actual Obsidian vault (`Home.md` entry point, `Projects/`, `Tools/`, `Daily/`,
  `Templates/`). Not code; edited through Obsidian or by the plugin/inbox-watcher.
- **`plugin/`** — TypeScript Obsidian plugin (`main.ts`) providing commands to log tool usage, create
  tool/project notes, and rebuild `Tools/Dashboard.md` from note frontmatter (`times_used`, `last_used`).
  Folder names it operates on are configurable in plugin settings.
  ```bash
  cd obsidian-brain/plugin
  npm install
  npm run build       # tsc -noEmit -skipLibCheck && esbuild production bundle -> main.js
  npm run dev          # esbuild watch mode
  npm run typecheck    # tsc -noEmit -skipLibCheck only
  ```
  Install by copying `manifest.json` + built `main.js` into `vault/.obsidian/plugins/obsidian-brain/`.
- **`inbox-watcher/`** — standalone Node.js script (`src/watch.js`, no Obsidian API), watches the
  vault's `Inbox/` folder, uses the Anthropic API to summarize/classify dropped files, and files a note
  into `Tools/`/`Projects/`/`Notes/` while archiving the original into `Attachments/` (never deletes;
  on any processing failure the file is left in the inbox untouched, and collisions in `Attachments/`
  get a numeric suffix rather than overwriting). Writes notes with the same frontmatter schema as the
  plugin, so the plugin's dashboard command picks them up.
  ```bash
  cd obsidian-brain/inbox-watcher
  npm install
  cp .env.example .env   # set ANTHROPIC_API_KEY, VAULT_PATH, INBOX_DIR, ATTACHMENTS_DIR, MODEL
  npm start               # runs src/watch.js
  npm test                 # runs test/run-test.js against a mocked Claude client — no API key/network needed
  ```
  Supported input types: `.md/.txt/.csv/.json/.log` (read directly), `.pdf` (`pdf-parse`), `.docx`
  (`mammoth`), `.png/.jpg/.jpeg/.webp/.gif` (sent to Claude as an image). Every dropped file triggers one
  real, billed Claude API call (content truncated to ~20k chars); there is no batching/caching, so keep
  that in mind when testing changes against the live watcher rather than the mocked test suite.

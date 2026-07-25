# Obsidian Brain

A personal Obsidian vault + companion plugin for keeping notes, projects,
and tool usage in one linked knowledge base.

- **`vault/`** — the Obsidian vault itself: `Home.md` as the entry point,
  `Projects/` (seeded with notes converted from this repo and
  `File-Force-One`), `Tools/` (a live-updating tools dashboard), `Daily/`
  (auto-created daily logs), and `Templates/` used by the plugin.
- **`plugin/`** — the `obsidian-brain` Obsidian plugin (TypeScript). It adds
  commands to log tool usage, catalog tools, create project notes, and
  refresh the tools dashboard. See `plugin/README.md` for build/install
  instructions.
- **`inbox-watcher/`** — a standalone Node.js tool (no Obsidian API). Drop
  any file (note, PDF, docx, image) into the vault's `Inbox/` folder and it
  uses Claude to summarize/classify it, then files a note into
  `Tools/`/`Projects/`/`Notes/` and archives the original into
  `Attachments/`. Requires your own Anthropic API key. See
  `inbox-watcher/README.md`.

## Getting started

1. `cd plugin && npm install && npm run build`
2. Copy `plugin/manifest.json` and the built `plugin/main.js` into
   `vault/.obsidian/plugins/obsidian-brain/`.
3. Open `vault/` as an Obsidian vault. The plugin is already listed as
   enabled in `.obsidian/community-plugins.json`.
4. Start with `Home.md`, or run the **Obsidian Brain: Log tool usage**
   command from the command palette.

## Why it lives here

This was scaffolded inside `devtools-adb-extension` rather than a
standalone repo (the session creating it didn't have permission to create
new GitHub repositories). It's self-contained and doesn't touch the
extension's own build (`Makefile`, `extension/`, `dist/`) at all.

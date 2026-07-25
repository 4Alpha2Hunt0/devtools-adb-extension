# Obsidian Brain (plugin)

An Obsidian plugin that logs tool usage into linked daily notes and a tool
reference database, and keeps a live "Tools Dashboard" note up to date.

## Commands

- **Log tool usage** — prompts for a tool name and an optional note. Creates
  the tool's note under `Tools/` if it doesn't exist yet (or reuses it),
  bumps its `times_used`/`last_used` frontmatter, appends a line to its
  `## Usage Log` section, and appends a linked line to today's daily note
  under `## Tool Log`. Creates today's daily note from the template if it
  doesn't exist yet.
- **New tool reference note** — catalogs a tool (name, description, tags)
  without counting it as a "use".
- **New project note** — creates a note under `Projects/` from the project
  template.
- **Refresh tools dashboard** — rebuilds `Tools/Dashboard.md` from the
  frontmatter of every note in `Tools/`, sorted by usage count.

Folder names (`Daily`, `Tools`, `Projects`, `Templates`) are configurable in
the plugin settings tab.

## Building

```bash
npm install
npm run build      # type-checks and produces main.js
npm run dev         # watch mode for development
```

## Installing into a vault

Copy `manifest.json` and the built `main.js` (and `styles.css` if present)
into `<vault>/.obsidian/plugins/obsidian-brain/`, then enable **Obsidian
Brain** under Settings → Community plugins.

The vault in `../vault` already lists `obsidian-brain` as an enabled
community plugin (`.obsidian/community-plugins.json`), so once the built
files are copied into its `.obsidian/plugins/obsidian-brain/` folder it
will load automatically.

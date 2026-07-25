import { App, Plugin, PluginSettingTab, Setting, TFile, Modal, Notice } from "obsidian";

interface ObsidianBrainSettings {
	dailyFolder: string;
	toolsFolder: string;
	projectsFolder: string;
	templatesFolder: string;
}

const DEFAULT_SETTINGS: ObsidianBrainSettings = {
	dailyFolder: "Daily",
	toolsFolder: "Tools",
	projectsFolder: "Projects",
	templatesFolder: "Templates",
};

const DASHBOARD_NAME = "Dashboard";

function pad(n: number): string {
	return n.toString().padStart(2, "0");
}

function todayStr(): string {
	const d = new Date();
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowTimeStr(): string {
	const d = new Date();
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sanitizeFileName(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function ensureFolder(app: App, path: string): Promise<void> {
	if (!app.vault.getAbstractFileByPath(path)) {
		try {
			await app.vault.createFolder(path);
		} catch (e) {
			// folder may have been created concurrently; nothing to do
		}
	}
}

/** Inserts `line` as a new bullet directly under a `## Heading` line, creating the heading if missing. */
async function appendUnderHeading(app: App, file: TFile, heading: string, line: string): Promise<void> {
	const content = await app.vault.read(file);
	const headingRegex = new RegExp(`^${escapeRegExp(heading)}\\s*$`, "m");
	const match = headingRegex.exec(content);
	if (!match) {
		const newContent = `${content.trimEnd()}\n\n${heading}\n${line}\n`;
		await app.vault.modify(file, newContent);
		return;
	}
	const insertAt = match.index + match[0].length;
	const newContent = `${content.slice(0, insertAt)}\n${line}${content.slice(insertAt)}`;
	await app.vault.modify(file, newContent);
}

async function loadTemplate(app: App, templatesFolder: string, templateName: string): Promise<string> {
	const path = `${templatesFolder}/${templateName}.md`;
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		return app.vault.read(file);
	}
	return `---\ntitle: {{name}}\ntags: []\n---\n\n# {{name}}\n`;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
	let out = template;
	for (const [key, value] of Object.entries(vars)) {
		out = out.split(`{{${key}}}`).join(value);
	}
	return out;
}

async function ensureDailyNote(app: App, settings: ObsidianBrainSettings): Promise<TFile> {
	await ensureFolder(app, settings.dailyFolder);
	const date = todayStr();
	const path = `${settings.dailyFolder}/${date}.md`;
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return existing;
	const template = await loadTemplate(app, settings.templatesFolder, "Daily Note");
	const content = fillTemplate(template, { date });
	return app.vault.create(path, content);
}

interface ToolNoteResult {
	file: TFile;
	created: boolean;
}

async function ensureToolNote(
	app: App,
	settings: ObsidianBrainSettings,
	toolName: string
): Promise<ToolNoteResult> {
	await ensureFolder(app, settings.toolsFolder);
	const fileName = sanitizeFileName(toolName);
	const path = `${settings.toolsFolder}/${fileName}.md`;
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return { file: existing, created: false };
	const template = await loadTemplate(app, settings.templatesFolder, "Tool Note");
	const content = fillTemplate(template, { name: toolName, date: todayStr() });
	const file = await app.vault.create(path, content);
	return { file, created: true };
}

/** Logs a use of `toolName`: bumps its usage frontmatter, appends a linked entry to
 * both the tool note and today's daily note. This is the core "smart logging" behavior. */
async function logToolUsage(
	app: App,
	settings: ObsidianBrainSettings,
	toolName: string,
	note: string
): Promise<void> {
	const { file: toolFile } = await ensureToolNote(app, settings, toolName);
	const dailyFile = await ensureDailyNote(app, settings);
	const date = todayStr();
	const time = nowTimeStr();

	await app.fileManager.processFrontMatter(toolFile, (fm) => {
		fm.times_used = (typeof fm.times_used === "number" ? fm.times_used : 0) + 1;
		if (!fm.first_used) fm.first_used = date;
		fm.last_used = date;
	});

	const dailyLink = `[[${settings.dailyFolder}/${date}|${date}]]`;
	const toolLogLine = note
		? `- ${date} ${time} — ${note} (from ${dailyLink})`
		: `- ${date} ${time} — logged from ${dailyLink}`;
	await appendUnderHeading(app, toolFile, "## Usage Log", toolLogLine);

	const toolLink = `[[${settings.toolsFolder}/${toolFile.basename}|${toolFile.basename}]]`;
	const dailyLogLine = note ? `- ${time} ${toolLink} — ${note}` : `- ${time} ${toolLink}`;
	await appendUnderHeading(app, dailyFile, "## Tool Log", dailyLogLine);
}

interface ToolFrontmatter {
	times_used?: number;
	last_used?: string;
	first_used?: string;
	tags?: string[];
}

async function refreshToolsDashboard(app: App, settings: ObsidianBrainSettings): Promise<void> {
	await ensureFolder(app, settings.toolsFolder);
	const dashboardPath = `${settings.toolsFolder}/${DASHBOARD_NAME}.md`;
	const toolFiles = app.vault
		.getFiles()
		.filter((f) => f.path.startsWith(`${settings.toolsFolder}/`) && f.path !== dashboardPath);

	const rows = toolFiles
		.map((f) => {
			const fm = (app.metadataCache.getFileCache(f)?.frontmatter ?? {}) as ToolFrontmatter;
			return {
				name: f.basename,
				path: f.path,
				timesUsed: typeof fm.times_used === "number" ? fm.times_used : 0,
				lastUsed: fm.last_used ?? "—",
				tags: (fm.tags ?? []).filter((t) => t !== "tool").join(", ") || "—",
			};
		})
		.sort((a, b) => b.timesUsed - a.timesUsed || a.name.localeCompare(b.name));

	const table =
		rows.length === 0
			? "No tools logged yet. Run `Obsidian Brain: Log tool usage` or `Obsidian Brain: New tool reference note` to get started."
			: [
					"| Tool | Times used | Last used | Tags |",
					"|---|---|---|---|",
					...rows.map(
						(r) => `| [[${r.path}\\|${r.name}]] | ${r.timesUsed} | ${r.lastUsed} | ${r.tags} |`
					),
			  ].join("\n");

	const content = [
		"---",
		"title: Tools Dashboard",
		"tags: [dashboard]",
		"generated: true",
		"---",
		"",
		"# Tools Dashboard",
		"",
		"This note is regenerated by **Obsidian Brain: Refresh tools dashboard**.",
		"Don't edit it by hand — your edits will be overwritten on the next refresh.",
		"",
		`_Last refreshed: ${todayStr()} ${nowTimeStr()}_`,
		"",
		table,
		"",
	].join("\n");

	const existing = app.vault.getAbstractFileByPath(dashboardPath);
	if (existing instanceof TFile) {
		await app.vault.modify(existing, content);
	} else {
		await app.vault.create(dashboardPath, content);
	}
}

async function createProjectNote(app: App, settings: ObsidianBrainSettings, name: string): Promise<TFile> {
	await ensureFolder(app, settings.projectsFolder);
	const fileName = sanitizeFileName(name);
	const path = `${settings.projectsFolder}/${fileName}.md`;
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return existing;
	const template = await loadTemplate(app, settings.templatesFolder, "Project Note");
	const content = fillTemplate(template, { name, date: todayStr() });
	return app.vault.create(path, content);
}

async function createToolReferenceNote(
	app: App,
	settings: ObsidianBrainSettings,
	name: string,
	description: string,
	extraTags: string[]
): Promise<TFile> {
	const { file, created } = await ensureToolNote(app, settings, name);
	if (created && description) {
		await appendUnderHeading(app, file, "## What it's for", `- ${description}`);
	}
	if (extraTags.length > 0) {
		await app.fileManager.processFrontMatter(file, (fm) => {
			const existingTags: string[] = Array.isArray(fm.tags) ? fm.tags : [];
			fm.tags = Array.from(new Set([...existingTags, ...extraTags]));
		});
	}
	return file;
}

class PromptModal extends Modal {
	private onSubmit: (values: Record<string, string>) => void;
	private fields: { key: string; label: string; multiline?: boolean }[];
	private values: Record<string, string> = {};

	constructor(
		app: App,
		title: string,
		fields: { key: string; label: string; multiline?: boolean }[],
		onSubmit: (values: Record<string, string>) => void
	) {
		super(app);
		this.fields = fields;
		this.onSubmit = onSubmit;
		this.titleEl.setText(title);
	}

	onOpen(): void {
		const { contentEl } = this;
		for (const field of this.fields) {
			const setting = new Setting(contentEl).setName(field.label);
			if (field.multiline) {
				setting.addTextArea((text) =>
					text.onChange((value) => {
						this.values[field.key] = value;
					})
				);
			} else {
				setting.addText((text) =>
					text.onChange((value) => {
						this.values[field.key] = value;
					})
				);
			}
		}
		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Submit")
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(this.values);
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export default class ObsidianBrainPlugin extends Plugin {
	settings: ObsidianBrainSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "log-tool-usage",
			name: "Log tool usage",
			callback: () => {
				new PromptModal(
					this.app,
					"Log tool usage",
					[
						{ key: "name", label: "Tool name" },
						{ key: "note", label: "Note (optional)", multiline: true },
					],
					async (values) => {
						const name = values.name?.trim();
						if (!name) {
							new Notice("Tool name is required");
							return;
						}
						await logToolUsage(this.app, this.settings, name, values.note?.trim() ?? "");
						new Notice(`Logged use of "${name}"`);
					}
				).open();
			},
		});

		this.addCommand({
			id: "new-tool-reference-note",
			name: "New tool reference note",
			callback: () => {
				new PromptModal(
					this.app,
					"New tool reference note",
					[
						{ key: "name", label: "Tool name" },
						{ key: "description", label: "What it's for" },
						{ key: "tags", label: "Extra tags (comma separated)" },
					],
					async (values) => {
						const name = values.name?.trim();
						if (!name) {
							new Notice("Tool name is required");
							return;
						}
						const extraTags = (values.tags ?? "")
							.split(",")
							.map((t) => t.trim())
							.filter(Boolean);
						const file = await createToolReferenceNote(
							this.app,
							this.settings,
							name,
							values.description?.trim() ?? "",
							extraTags
						);
						await this.app.workspace.getLeaf(false).openFile(file);
					}
				).open();
			},
		});

		this.addCommand({
			id: "new-project-note",
			name: "New project note",
			callback: () => {
				new PromptModal(this.app, "New project note", [{ key: "name", label: "Project name" }], async (values) => {
					const name = values.name?.trim();
					if (!name) {
						new Notice("Project name is required");
						return;
					}
					const file = await createProjectNote(this.app, this.settings, name);
					await this.app.workspace.getLeaf(false).openFile(file);
				}).open();
			},
		});

		this.addCommand({
			id: "refresh-tools-dashboard",
			name: "Refresh tools dashboard",
			callback: async () => {
				await refreshToolsDashboard(this.app, this.settings);
				new Notice("Tools dashboard refreshed");
			},
		});

		this.addSettingTab(new ObsidianBrainSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

class ObsidianBrainSettingTab extends PluginSettingTab {
	plugin: ObsidianBrainPlugin;

	constructor(app: App, plugin: ObsidianBrainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Daily notes folder")
			.addText((text) =>
				text.setValue(this.plugin.settings.dailyFolder).onChange(async (value) => {
					this.plugin.settings.dailyFolder = value || DEFAULT_SETTINGS.dailyFolder;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Tools folder")
			.addText((text) =>
				text.setValue(this.plugin.settings.toolsFolder).onChange(async (value) => {
					this.plugin.settings.toolsFolder = value || DEFAULT_SETTINGS.toolsFolder;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Projects folder")
			.addText((text) =>
				text.setValue(this.plugin.settings.projectsFolder).onChange(async (value) => {
					this.plugin.settings.projectsFolder = value || DEFAULT_SETTINGS.projectsFolder;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Templates folder")
			.addText((text) =>
				text.setValue(this.plugin.settings.templatesFolder).onChange(async (value) => {
					this.plugin.settings.templatesFolder = value || DEFAULT_SETTINGS.templatesFolder;
					await this.plugin.saveSettings();
				})
			);
	}
}

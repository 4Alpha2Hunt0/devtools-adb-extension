"use strict";
const fs = require("fs");
const path = require("path");

function sanitizeFileName(name) {
	return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

function uniquePath(fullPath) {
	if (!fs.existsSync(fullPath)) return fullPath;
	const dir = path.dirname(fullPath);
	const ext = path.extname(fullPath);
	const base = path.basename(fullPath, ext);
	let i = 2;
	let candidate;
	do {
		candidate = path.join(dir, `${base} ${i}${ext}`);
		i++;
	} while (fs.existsSync(candidate));
	return candidate;
}

function todayStr() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toVaultLink(vaultPath, absPath) {
	return path.relative(vaultPath, absPath).split(path.sep).join("/");
}

function archiveOriginal(vaultPath, attachmentsDir, originalFilePath, fileName) {
	const destDir = path.join(vaultPath, attachmentsDir);
	fs.mkdirSync(destDir, { recursive: true });
	const dest = uniquePath(path.join(destDir, fileName));
	fs.renameSync(originalFilePath, dest);
	return toVaultLink(vaultPath, dest);
}

function folderForCategory(category) {
	if (category === "tool") return "Tools";
	if (category === "project") return "Projects";
	return "Notes";
}

/** Tool/project notes reuse the exact frontmatter schema the Obsidian Brain plugin
 * writes (times_used, first_used, last_used, links / status, source_repo, created) so
 * plugin commands like "Refresh tools dashboard" pick up AI-filed notes correctly. */
function buildNote(classification, attachmentRelPath, fileName) {
	const date = todayStr();
	const tags = classification.tags || [];
	const summary = classification.summary || "(no summary produced)";

	if (classification.category === "tool") {
		const fmTags = Array.from(new Set(["tool", ...tags]));
		return [
			"---",
			`title: ${classification.title}`,
			`tags: [${fmTags.join(", ")}]`,
			"type: tool",
			"times_used: 0",
			`first_used: ${date}`,
			`last_used: ${date}`,
			"links: []",
			"---",
			"",
			`# ${classification.title}`,
			"",
			"## What it's for",
			`- ${summary}`,
			"",
			"## Usage Log",
			'<!-- Entries added automatically by "Obsidian Brain: Log tool usage" -->',
			"",
			"## Source",
			`- Filed automatically from [[${attachmentRelPath}|${fileName}]] on ${date}`,
			"",
		].join("\n");
	}

	if (classification.category === "project") {
		const fmTags = Array.from(new Set(["project", ...tags]));
		return [
			"---",
			`title: ${classification.title}`,
			`tags: [${fmTags.join(", ")}]`,
			"status: active",
			"source_repo:",
			`created: ${date}`,
			"---",
			"",
			`# ${classification.title}`,
			"",
			"## Summary",
			`- ${summary}`,
			"",
			"## Links",
			`- [[${attachmentRelPath}|${fileName}]] (original file)`,
			"",
			"## Notes",
			"-",
			"",
		].join("\n");
	}

	const fmTags = Array.from(new Set(["note", ...tags]));
	return [
		"---",
		`title: ${classification.title}`,
		`tags: [${fmTags.join(", ")}]`,
		"type: note",
		`created: ${date}`,
		"---",
		"",
		`# ${classification.title}`,
		"",
		"## Summary",
		`- ${summary}`,
		"",
		"## Source",
		`- [[${attachmentRelPath}|${fileName}]]`,
		"",
	].join("\n");
}

/** Archives the original dropped file into Attachments/ and writes a new note into
 * Tools/, Projects/, or Notes/ (chosen by classification.category). Returns the
 * vault-relative paths of both, for logging. */
function fileIntoVault(vaultPath, config, classification, originalFilePath, fileName) {
	const fallbackTitle = path.basename(fileName, path.extname(fileName));
	const title = sanitizeFileName(classification.title || fallbackTitle);
	const folder = folderForCategory(classification.category);
	const noteDir = path.join(vaultPath, folder);
	fs.mkdirSync(noteDir, { recursive: true });
	const notePath = uniquePath(path.join(noteDir, `${title}.md`));

	const attachmentRelPath = archiveOriginal(vaultPath, config.attachmentsDir, originalFilePath, fileName);
	const content = buildNote({ ...classification, title }, attachmentRelPath, fileName);
	fs.writeFileSync(notePath, content, "utf8");

	return {
		notePath: toVaultLink(vaultPath, notePath),
		attachmentPath: attachmentRelPath,
	};
}

module.exports = { fileIntoVault, sanitizeFileName, uniquePath, buildNote, folderForCategory };

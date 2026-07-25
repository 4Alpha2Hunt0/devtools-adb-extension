"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const { extractContent } = require("../src/extract");
const { classifyContent, parseClassification } = require("../src/classify");
const { fileIntoVault, uniquePath } = require("../src/vaultWriter");

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "inbox-watcher-test-"));
const VAULT = path.join(TMP_ROOT, "vault");
const INBOX = path.join(VAULT, "Inbox");
fs.mkdirSync(INBOX, { recursive: true });

const config = { attachmentsDir: "Attachments" };

const assertions = [];
function check(label, cond) {
	assertions.push({ label, pass: !!cond });
}

// A well-known minimal 1x1 transparent PNG, used only to exercise the image-reading path.
const TINY_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function writeInboxFile(name, content) {
	const p = path.join(INBOX, name);
	if (Buffer.isBuffer(content)) fs.writeFileSync(p, content);
	else fs.writeFileSync(p, content, "utf8");
	return p;
}

function makeMockClient(responses) {
	let i = 0;
	const calls = [];
	return {
		calls,
		messages: {
			async create(opts) {
				calls.push(opts);
				const text = responses[Math.min(i, responses.length - 1)];
				i++;
				return { content: [{ type: "text", text }] };
			},
		},
	};
}

(async () => {
	// --- extractContent: text passthrough ---
	const mdPath = writeInboxFile("note1.md", "# Hello\n\nSome markdown content.");
	const mdExtracted = await extractContent(mdPath);
	check("extract: markdown read directly", mdExtracted.kind === "text" && mdExtracted.text.includes("Some markdown"));

	// --- extractContent: pdf/docx dispatch via injected fakes (routing test, not library correctness) ---
	const pdfPath = writeInboxFile("report.pdf", Buffer.from("not a real pdf, just bytes"));
	const pdfExtracted = await extractContent(pdfPath, { extractPdfText: async () => "FAKE PDF TEXT" });
	check(
		"extract: .pdf routed to injected PDF extractor",
		pdfExtracted.kind === "text" && pdfExtracted.text === "FAKE PDF TEXT"
	);

	const docxPath = writeInboxFile("doc.docx", Buffer.from("not a real docx, just bytes"));
	const docxExtracted = await extractContent(docxPath, { extractDocxText: async () => "FAKE DOCX TEXT" });
	check(
		"extract: .docx routed to injected DOCX extractor",
		docxExtracted.kind === "text" && docxExtracted.text === "FAKE DOCX TEXT"
	);

	// --- extractContent: image ---
	const pngPath = writeInboxFile("shot.png", Buffer.from(TINY_PNG_BASE64, "base64"));
	const pngExtracted = await extractContent(pngPath);
	check(
		"extract: image read as base64 with correct media type",
		pngExtracted.kind === "image" &&
			pngExtracted.mediaType === "image/png" &&
			pngExtracted.imageBase64 === TINY_PNG_BASE64
	);

	// --- extractContent: unsupported binary rejected ---
	const binPath = writeInboxFile("weird.bin", Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0xfe, 0xfd]));
	let binThrew = false;
	try {
		await extractContent(binPath);
	} catch (e) {
		binThrew = true;
	}
	check("extract: unsupported binary file throws", binThrew);

	// --- classifyContent: valid JSON response ---
	const client1 = makeMockClient([
		'{"title": "Git", "summary": "Version control tool.", "tags": ["vcs", "cli"], "category": "tool"}',
	]);
	const c1 = await classifyContent(client1, "claude-sonnet-5", mdExtracted, "note1.md");
	check("classify: parses clean JSON", c1.title === "Git" && c1.category === "tool" && c1.tags.includes("vcs"));
	check(
		"classify: passes model + message content to client",
		client1.calls[0].model === "claude-sonnet-5" && Array.isArray(client1.calls[0].messages[0].content)
	);

	// --- classifyContent: JSON wrapped in markdown fences ---
	const fenced = "Sure, here you go:\n```json\n{\"title\": \"Fenced\", \"summary\": \"s\", \"tags\": [], \"category\": \"note\"}\n```";
	const c2 = parseClassification(fenced);
	check("classify: extracts JSON out of markdown fences", c2.title === "Fenced" && c2.category === "note");

	// --- classifyContent: garbage response falls back gracefully ---
	const c3 = parseClassification("I cannot help with that.");
	check(
		"classify: non-JSON response falls back to category 'note' with raw text as summary",
		c3.category === "note" && c3.title === null && c3.summary.includes("cannot help")
	);

	// --- classifyContent: invalid category falls back to 'note' ---
	const c4 = parseClassification('{"title": "X", "summary": "y", "tags": [], "category": "banana"}');
	check("classify: invalid category coerced to 'note'", c4.category === "note");

	// --- fileIntoVault: tool category, schema compatible with the Obsidian plugin ---
	const toolResult = fileIntoVault(VAULT, config, c1, mdPath, "note1.md");
	check("fileIntoVault: tool note created in Tools/", toolResult.notePath === "Tools/Git.md");
	const toolContent = fs.readFileSync(path.join(VAULT, "Tools/Git.md"), "utf8");
	check("fileIntoVault: tool note has times_used: 0 (plugin-compatible schema)", /times_used:\s*0/.test(toolContent));
	check("fileIntoVault: tool note links to archived original", toolContent.includes("[[Attachments/note1.md|note1.md]]"));
	check("fileIntoVault: original archived, not left in Inbox", !fs.existsSync(mdPath) && fs.existsSync(path.join(VAULT, "Attachments/note1.md")));

	// --- fileIntoVault: project category ---
	const projectClassification = { title: "My Project", summary: "A cool project.", tags: ["cli"], category: "project" };
	const projPath = writeInboxFile("proj.txt", "project description");
	const projResult = fileIntoVault(VAULT, config, projectClassification, projPath, "proj.txt");
	check("fileIntoVault: project note created in Projects/", projResult.notePath === "Projects/My Project.md");
	const projContent = fs.readFileSync(path.join(VAULT, projResult.notePath), "utf8");
	check("fileIntoVault: project note has status: active", projContent.includes("status: active"));

	// --- fileIntoVault: note category (new Notes/ folder) ---
	const noteClassification = { title: "Some Article", summary: "An article.", tags: ["reading"], category: "note" };
	const notePath1 = writeInboxFile("article.txt", "article body");
	const noteResult = fileIntoVault(VAULT, config, noteClassification, notePath1, "article.txt");
	check("fileIntoVault: note created in Notes/", noteResult.notePath === "Notes/Some Article.md");

	// --- fileIntoVault: collision handling (same title filed twice) ---
	const dupPath = writeInboxFile("article2.txt", "another article, same title");
	const dupResult = fileIntoVault(VAULT, config, noteClassification, dupPath, "article2.txt");
	check("fileIntoVault: name collision gets numeric suffix", dupResult.notePath === "Notes/Some Article 2.md");
	check(
		"fileIntoVault: attachment collision also gets numeric suffix if names clash",
		fs.existsSync(path.join(VAULT, "Attachments/article.txt")) && fs.existsSync(path.join(VAULT, "Attachments/article2.txt"))
	);

	// --- uniquePath: sanity check on a file that doesn't exist yet ---
	check(
		"uniquePath: returns original path unchanged when nothing exists yet",
		uniquePath(path.join(VAULT, "Notes/Brand New.md")) === path.join(VAULT, "Notes/Brand New.md")
	);

	let failed = 0;
	for (const a of assertions) {
		console.log(`${a.pass ? "PASS" : "FAIL"} - ${a.label}`);
		if (!a.pass) failed++;
	}
	if (failed > 0) {
		console.log(`\n${failed} of ${assertions.length} assertion(s) FAILED`);
		process.exit(1);
	}
	console.log(`\nAll ${assertions.length} assertions passed`);
})().catch((e) => {
	console.error("TEST SCRIPT THREW:", e);
	process.exit(1);
});

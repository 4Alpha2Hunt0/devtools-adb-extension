"use strict";

const VALID_CATEGORIES = new Set(["tool", "project", "note"]);
const MAX_TEXT_CHARS = 20000;

function buildInstructions(fileName) {
	return [
		`The file is named "${fileName}". It's being filed into a personal Obsidian knowledge vault.`,
		"Respond with ONLY a JSON object (no markdown fences, no prose before or after) with these keys:",
		'- "title": a short descriptive title (used as the note\'s filename, no slashes or colons)',
		'- "summary": a 2-4 sentence summary of the content',
		'- "tags": an array of 2-6 lowercase kebab-case tags',
		'- "category": one of "tool", "project", or "note" — "tool" if this describes a piece of',
		'  software/utility, "project" if it describes a project/codebase/initiative, "note" for',
		"  anything else (articles, ideas, reference material, receipts, etc.)",
	].join("\n");
}

function buildMessageContent(extracted, fileName) {
	const instructions = buildInstructions(fileName);
	if (extracted.kind === "image") {
		return [
			{ type: "image", source: { type: "base64", media_type: extracted.mediaType, data: extracted.imageBase64 } },
			{ type: "text", text: instructions },
		];
	}
	const text = (extracted.text || "").slice(0, MAX_TEXT_CHARS);
	return [{ type: "text", text: `${instructions}\n\nContent:\n"""\n${text}\n"""` }];
}

function parseClassification(raw) {
	const jsonMatch = raw.match(/\{[\s\S]*\}/);
	const jsonStr = jsonMatch ? jsonMatch[0] : raw;
	let parsed;
	try {
		parsed = JSON.parse(jsonStr);
	} catch (e) {
		return { title: null, summary: raw.trim().slice(0, 500), tags: [], category: "note" };
	}
	const category = VALID_CATEGORIES.has(parsed.category) ? parsed.category : "note";
	return {
		title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : null,
		summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
		tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string") : [],
		category,
	};
}

/** Sends `extracted` content to Claude for summarization/classification.
 * `client` is an Anthropic SDK instance (or a test double with the same `.messages.create` shape). */
async function classifyContent(client, model, extracted, fileName) {
	const response = await client.messages.create({
		model,
		max_tokens: 1024,
		messages: [{ role: "user", content: buildMessageContent(extracted, fileName) }],
	});
	const raw = response.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
	return parseClassification(raw);
}

module.exports = { classifyContent, parseClassification, buildMessageContent };

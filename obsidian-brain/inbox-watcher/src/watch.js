#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const Anthropic = require("@anthropic-ai/sdk");
const { loadConfig } = require("./config");
const { extractContent } = require("./extract");
const { classifyContent } = require("./classify");
const { fileIntoVault } = require("./vaultWriter");

async function processFile(client, config, filePath) {
	const fileName = path.basename(filePath);
	console.log(`[inbox] processing ${fileName}`);
	try {
		const extracted = await extractContent(filePath);
		const classification = await classifyContent(client, config.model, extracted, fileName);
		const result = fileIntoVault(config.vaultPath, config, classification, filePath, fileName);
		console.log(`[inbox] filed "${fileName}" -> ${result.notePath} (original archived to ${result.attachmentPath})`);
	} catch (err) {
		console.error(`[inbox] FAILED to process ${fileName}: ${err.message}`);
		console.error("[inbox] left the file in place in the inbox — fix the issue and restart the watcher to retry it.");
	}
}

function main() {
	const config = loadConfig();
	const client = new Anthropic({ apiKey: config.apiKey });
	const inboxPath = path.join(config.vaultPath, config.inboxDir);
	fs.mkdirSync(inboxPath, { recursive: true });

	console.log(`[inbox] watching ${inboxPath}`);
	console.log(`[inbox] model: ${config.model}`);
	console.log("[inbox] drop any file in there and it'll be summarized and filed into Tools/, Projects/, or Notes/");

	const watcher = chokidar.watch(inboxPath, {
		ignoreInitial: false,
		awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
		depth: 0,
	});

	watcher.on("add", (filePath) => {
		if (path.basename(filePath).startsWith(".")) return;
		processFile(client, config, filePath);
	});
}

main();

"use strict";
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function required(name) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
	}
	return value;
}

function loadConfig() {
	return {
		apiKey: required("ANTHROPIC_API_KEY"),
		vaultPath: path.resolve(required("VAULT_PATH")),
		inboxDir: process.env.INBOX_DIR || "Inbox",
		attachmentsDir: process.env.ATTACHMENTS_DIR || "Attachments",
		model: process.env.MODEL || "claude-sonnet-5",
	};
}

module.exports = { loadConfig };

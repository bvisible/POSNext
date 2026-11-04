//// Neoffice — added file (no upstream equivalent).
//// Browser tests of POS Next's guest pages: the QR page of a table and the web takeaway order, driven
//// against a real instance (osiris) the way a diner meets them. The Python suite covers the endpoints;
//// this covers what they cannot: that the pages work in a browser, with the code that really comes by mail.
//// The target and the way onto its server live outside the repository, in ~/.config/pos-next-e2e.env.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

function readSecrets() {
	const file = path.join(os.homedir(), ".config", "pos-next-e2e.env");
	if (!fs.existsSync(file)) return;
	for (const line of fs.readFileSync(file, "utf8").split("\n")) {
		const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
		if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
	}
}
readSecrets();

if (!process.env.POSNEXT_E2E_URL) {
	throw new Error("POSNEXT_E2E_URL missing. Create ~/.config/pos-next-e2e.env (see README.md).");
}

module.exports = defineConfig({
	testDir: "./specs",
	globalSetup: require.resolve("./fixtures/global-setup.js"),
	//// The target is a shared development instance and every test makes its own table and its own diner:
	//// one worker, in file order, so that none of them reads another's mail.
	workers: 1,
	fullyParallel: false,
	retries: 1,
	timeout: 480_000,
	expect: { timeout: 15_000 },
	reporter: [["list"]],
	use: {
		baseURL: process.env.POSNEXT_E2E_URL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		locale: "fr-CH",
	},
	projects: [
		{ name: "phone", use: { ...devices["Pixel 7"] } },
		{
			name: "desktop",
			use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
		},
	],
});

/**
 * //// Neoffice — added file (no upstream equivalent). The till's dialogs in the dark theme (maintenance#2678). A frappe-ui Dialog turns
 * //// its panel dark by frappe-ui's own tokens, but what a dialog writes with a literal light-theme colour of the design system (ink #141414,
 * //// cream fills and lines, the 700 shades of the status colours) stayed light on the dark panel: the customer form's type switch showed
 * //// ink on dark, its country list too. Every such colour found in a dialog has its dark value in the till's stylesheet, scoped to the
 * //// dialog's panel. Read as text: the dialogs need a browser to render, the rule needs only the stylesheet and the templates.
 * @vitest-environment node
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../../", import.meta.url));

// The design system's light-theme values that cannot stand on a dark panel, by the property they paint.
const LIGHT_ONLY = {
	text: ["#141414", "#6F665A", "#A15A2E", "#0F7A4A", "#B45309"],
	bg: ["#F6F3ED", "#FAF8F5", "#FCF3EA"],
	border: ["#ECE7DE", "#DCD4C7"],
};

function vueFiles(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return name === "__tests__" ? [] : vueFiles(path);
		return name.endsWith(".vue") ? [path] : [];
	});
}

/** The light-only literal colours the frappe-ui dialogs of the till write, as Tailwind class names (`hover:` kept, `dark:` ones skipped). */
function lightClassesOfTheDialogs() {
	const found = new Set();
	for (const file of vueFiles(SRC)) {
		const source = readFileSync(file, "utf8");
		if (!/import\s*\{[^}]*\bDialog\b[^}]*\}\s*from\s*["']frappe-ui["']/.test(source)) continue;
		for (const match of source.matchAll(/(?<![\w:-])((?:hover:)?)(text|bg|border)-\[(#[0-9A-Fa-f]{6})\](?![\w/])/g)) {
			const [, variant, kind, hex] = match;
			if (LIGHT_ONLY[kind].includes(hex.toUpperCase())) found.add(`${variant}${kind}-[${hex}]`);
		}
	}
	return [...found];
}

/** The selectors of the till's stylesheet that give a class its dark value inside a dialog's panel. */
function darkDialogSelectorsOf(className) {
	const escaped = "." + className.replace(/[[\]#:]/g, (char) => `\\${char}`);
	const sheet = postcss.parse(readFileSync(join(SRC, "index.css"), "utf8"));
	const selectors = [];
	sheet.walkRules((rule) => {
		for (const selector of rule.selectors)
			if (selector.includes(escaped) && selector.includes(".dialog-content") && selector.includes("[data-theme='dark']"))
				selectors.push(selector);
	});
	return selectors;
}

describe("the till's dialogs in the dark theme", () => {
	const classes = lightClassesOfTheDialogs();

	it("finds the literal light colours the dialogs write (the customer form's at least)", () => {
		expect(classes).toEqual(expect.arrayContaining(["text-[#141414]", "bg-[#F6F3ED]", "border-[#ECE7DE]"]));
	});

	it("gives each of them its dark value inside the dialog's panel", () => {
		for (const className of classes) expect(darkDialogSelectorsOf(className), className).not.toEqual([]);
	});
});

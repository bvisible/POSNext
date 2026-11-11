/**
 * //// Neoffice — added file (no upstream equivalent). In a scoped style, Vue compiles `:global(.dark) .tile` to `.dark` alone: everything after the
 * //// `:global()` is dropped, and the rule paints <html> instead of the element (maintenance#2256: the restaurant's menu tiles kept their pale face under
 * //// the dark theme's light text, the reservation cards their light card). A rule that reaches past a global ancestor writes the whole selector inside:
 * //// `:global(.dark .tile)`. This reads every component of the till and refuses the broken form.
 * @vitest-environment node
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");

function components(dir = SRC, found = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "__tests__") continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) components(full, found);
		else if (entry.name.endsWith(".vue")) found.push(full);
	}
	return found;
}

// `:global(<ancestor>)` followed by more of the selector, before the next comma or brace
const PARTIAL_GLOBAL = /:global\([^)]*\)[ \t]*[^\s,{]/;

describe("a global ancestor in a scoped style", () => {
	it("holds the whole selector, in every component of the till", () => {
		const broken = [];
		for (const file of components()) {
			for (const style of parse(fs.readFileSync(file, "utf8")).descriptor.styles) {
				if (!style.scoped) continue;
				style.content
					// Comments say anything: blanked, the lines kept
					.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
					.split("\n")
					.forEach((line, index) => {
						if (PARTIAL_GLOBAL.test(line))
							broken.push(
								`${path.relative(SRC, file)}:${index + 1}: ${line.trim()}`,
							);
					});
			}
		}
		expect(broken).toEqual([]);
	});

	it("reaches the element: the menu tile's dark rule is compiled with its class", () => {
		const file = path.join(SRC, "components/restaurant/RestaurantCardGrid.vue");
		const style = parse(fs.readFileSync(file, "utf8")).descriptor.styles.find((s) => s.scoped);
		const { code } = compileStyle({
			source: style.content,
			filename: file,
			id: "data-v-test",
			scoped: true,
		});
		expect(code).toContain('[data-theme="dark"] .tile--colored');
		expect(code).not.toMatch(/(^|\})\s*\.dark\s*,\s*\[data-theme="dark"\]\s*\{/m);
	});
});

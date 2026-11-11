/**
 * //// Neoffice — added file (no upstream equivalent). The office's page of a till's settings follows the desk's dark theme (maintenance#2491):
 * //// its card stayed white while the desk's fields written into it took the dark theme's light text, so the labels of the switches and the
 * //// multiple choices and the greyed fields were light on white. In the dark scope the card, the rail and the pills take the desk's own
 * //// surfaces and text, and the page's own colours the design system's dark values; the light theme is unchanged.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const PAGE = fileURLToPath(
	new URL(
		"../../../../../pos_next/pos_next/page/till_settings/till_settings.js",
		import.meta.url
	)
);

function theStylesheet() {
	const frappe = { pages: { "till-settings": {} } };
	new Function("frappe", "__", "$", "window", "document", readFileSync(PAGE, "utf8"))(
		frappe,
		(text) => text,
		() => ({}),
		{},
		{ getElementById: () => null }
	);
	return postcss.parse(frappe.pos_next_till_settings.stylesheet);
}

const sheet = theStylesheet();

/** The declarations a selector gets, light (as written) or in the dark scope. */
function declarationsOf(selector) {
	const found = {};
	sheet.walkRules((rule) => {
		if (rule.parent?.type === "atrule") return;
		if (!rule.selectors.includes(selector)) return;
		rule.walkDecls((decl) => {
			found[decl.prop] = decl.value;
		});
	});
	return found;
}

const DARK = '[data-theme="dark"] ';

describe("the page in the desk's dark theme", () => {
	it("draws its card, its rail and its note on the desk's own surfaces, as the desk's fields in it expect", () => {
		expect(declarationsOf(DARK + ".tsp-panel")).toMatchObject({
			background: "var(--card-bg)",
			"border-color": "var(--border-color)",
		});
		expect(declarationsOf(DARK + ".tsp-rail").background).toBe("var(--subtle-fg)");
		expect(declarationsOf(DARK + ".tsp-note").background).toBe("var(--subtle-fg)");
	});

	it("writes its own words in the desk's text colours", () => {
		for (const selector of [
			".tsp-label",
			".tsp-tab",
			".tsp-group h3",
			".tsp-lock",
			".tsp-sub",
		])
			expect(declarationsOf(DARK + selector).color, selector).toBe("var(--text-muted)");
		for (const selector of [
			".tsp-help",
			".tsp-people",
			".tsp-till",
			".tsp-chip",
			".tsp-sub b",
		])
			expect(declarationsOf(DARK + selector).color, selector).toBe("var(--text-color)");
	});

	it("turns its ink into paper and its status colours into the design system's dark ramp", () => {
		expect(declarationsOf(DARK + ".tsp-tab.on")).toMatchObject({
			background: "#FFFDF8",
			color: "#141414",
		});
		expect(declarationsOf(DARK + ".tsp-chip.ok").color).toBe("#CBEDD7");
		expect(declarationsOf(DARK + ".tsp-people .good").color).toBe("#3DBE74");
		expect(declarationsOf(DARK + ".tsp-people .bad").color).toBe("#E6A93B");
	});

	it("leaves the light theme as it was: a white card, dark words", () => {
		expect(declarationsOf(".tsp-panel").background).toBe("#fff");
		expect(declarationsOf(".tsp-label").color).toBe("#6F665A");
		expect(declarationsOf(".tsp-tab.on")).toMatchObject({
			background: "#141414",
			color: "#fff",
		});
	});
});

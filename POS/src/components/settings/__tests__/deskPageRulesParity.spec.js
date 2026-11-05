/**
 * //// Neoffice — added file (no upstream equivalent). The office's page of a till's settings (NeoResto lot 1, task 13b) is plain
 * //// desk JavaScript (pos_next/pos_next/page/till_settings/till_settings.js), which cannot import the till screen's rules
 * //// (tillSettingsForm.js). It carries its own copy of the pure ones — what is greyed, what is unticked, which groups stand in
 * //// which column, what changed, what a number or an hour may be — and this runs both on the same list and compares them: two
 * //// screens drawn from one list must grey, send and refuse the same things.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as till from "../tillSettingsForm";

const PAGE = fileURLToPath(
	new URL(
		"../../../../../pos_next/pos_next/page/till_settings/till_settings.js",
		import.meta.url
	)
);

// The page file is a script for the desk: it registers itself on `frappe.pages` and shows its rules on `frappe`
function loadTheDeskRules() {
	const frappe = { pages: { "till-settings": {} } };
	new Function("frappe", "__", "$", "window", "document", readFileSync(PAGE, "utf8"))(
		frappe,
		(text) => text,
		() => ({}),
		{},
		{ getElementById: () => null }
	);
	return frappe.pos_next_till_settings;
}

const desk = loadTheDeskRules();

const check = (key, extra = {}) => ({
	key,
	group: "g1",
	widget: "check",
	store: "document",
	editable: true,
	depends_on: [],
	...extra,
});

const LIST = {
	tabs: [
		{ key: "setup", label: "Getting started", section: "setup" },
		{ key: "restaurant", label: "Restaurant", section: "restaurant" },
		{ key: "general", label: "General", section: "till" },
		{ key: "payments", label: "Payments", section: "desk" },
	],
	groups: [
		{ key: "g1", tab: "general", label: "One", column: 1 },
		{ key: "g2", tab: "general", label: "Two", column: 2 },
		{ key: "g3", tab: "general", label: "Three", column: 2 },
		{ key: "g4", tab: "general", label: "Empty", column: 3 },
		{ key: "g5", tab: "restaurant", label: "Five", column: 1 },
	],
	settings: [
		check("tips"),
		check("tip_percent", {
			widget: "percent",
			depends_on: [{ key: "tips", equals: null, off: false }],
		}),
		check("credit_sale", { group: "g2" }),
		check("exact", {
			group: "g2",
			depends_on: [{ key: "credit_sale", equals: null, off: true }],
		}),
		check("partial", {
			group: "g3",
			depends_on: [{ key: "credit_sale", equals: null, off: true }],
		}),
		check("mode", {
			group: "g3",
			widget: "select",
			depends_on: [{ key: "tips", equals: "1", off: false }],
		}),
		check("locked", { group: "g3", editable: false }),
		check("hours", { group: "g5", widget: "time" }),
	],
};

const DRAFTS = [
	{},
	{ tips: 1, tip_percent: 5, credit_sale: 0, exact: 1, partial: 0, mode: "1" },
	{ tips: 0, credit_sale: 1, exact: 1, partial: 1, mode: "" },
	{ tips: "1", credit_sale: "0", exact: 0, partial: 1, mode: 1 },
	{ tips: [], credit_sale: ["x"], exact: 1, partial: 1, mode: "0" },
	{ tips: "  ", credit_sale: " 1", exact: 1, partial: 0, mode: undefined },
];

describe("the office page decides what the till's screen decides", () => {
	it("greys a setting while the setting it depends on is off", () => {
		for (const draft of DRAFTS) {
			for (const setting of LIST.settings) {
				expect(
					desk.conditionsHold(setting, draft),
					`${setting.key} in ${JSON.stringify(draft)}`
				).toBe(till.conditionsHold(setting, draft));
			}
		}
	});

	it("counts a value as on the way the till does", () => {
		for (const value of [
			0,
			1,
			"",
			"0",
			"1",
			" ",
			"x",
			[],
			["a"],
			null,
			undefined,
			true,
			false,
		]) {
			expect(desk.isOn(value), JSON.stringify(value)).toBe(till.isOn(value));
		}
	});

	it("unticks the box that cannot go with another one now on, and says which", () => {
		for (const draft of DRAFTS) {
			const mine = { ...draft };
			const theirs = { ...draft };
			expect(desk.untickExcluded(LIST.settings, mine)).toEqual(
				till.untickExcluded(LIST.settings, theirs)
			);
			expect(mine).toEqual(theirs);
		}
	});

	it("puts the groups of a tab in the same columns", () => {
		for (const tab of ["general", "restaurant", "payments", "nothing"]) {
			expect(desk.columnsOf(LIST, tab), tab).toEqual(till.columnsOf(LIST, tab));
		}
		expect(desk.columnsOf(null, "general")).toEqual(till.columnsOf(null, "general"));
	});

	it("sends what changed since the page was read, and what the user may change", () => {
		const read = {
			tips: 0,
			tip_percent: 0,
			credit_sale: 0,
			exact: 1,
			partial: 0,
			mode: "",
			locked: 0,
			hours: "05:00",
		};
		const drafts = [
			{ ...read },
			{ ...read, tips: 1, locked: 1 },
			{ ...read, hours: "03:30", mode: "1" },
			{ ...read, exact: 0, partial: 1 },
			{ tips: 1 },
		];
		for (const draft of drafts) {
			expect(desk.changedValues(LIST.settings, read, draft), JSON.stringify(draft)).toEqual(
				till.changedValues(LIST.settings, read, draft)
			);
		}
		// A setting that is not a field of a document is never sent
		const device = [{ key: "qz_printer", widget: "select", store: "device", editable: true }];
		expect(desk.changedValues(device, { qz_printer: "" }, { qz_printer: "x" })).toEqual(
			till.changedValues(device, { qz_printer: "" }, { qz_printer: "x" })
		);
	});

	it("takes the same hours and the same numbers", () => {
		for (const value of [
			"05:00",
			"00:00",
			"23:59",
			"24:00",
			"7:00",
			"12:60",
			"",
			"05:00:00",
			null,
			undefined,
			5,
			"abc",
		]) {
			expect(desk.isTimeOfDay(value), JSON.stringify(value)).toBe(till.isTimeOfDay(value));
		}
		const bounded = { min: 1, max: 10 };
		const open = { min: null, max: undefined };
		for (const setting of [bounded, open, { min: 0 }, { max: 3 }]) {
			for (const value of [0, 1, 5, 10, 11, -1, "7", "x", "", null, NaN, Infinity]) {
				expect(
					desk.withinBounds(setting, value),
					`${JSON.stringify(setting)} ${String(value)}`
				).toBe(till.withinBounds(setting, value));
			}
		}
	});

	it("lays the rail out as the till does, with the office's first tab before and its other tabs after", () => {
		const mine = desk.railSections(LIST);
		const theirs = till.railSections(LIST);
		expect(mine.map((section) => section.key)).toEqual([
			"setup",
			"restaurant",
			"till",
			"desk",
		]);
		// The till's own rail never has the office's tabs: what it draws is the middle of the office's
		expect(theirs.map((section) => section.key)).toEqual(["restaurant", "till"]);
		expect(mine.slice(1, 1 + theirs.length)).toEqual(theirs);
		expect(mine[0].tabs.map((tab) => tab.key)).toEqual(["setup"]);
		expect(mine[3].tabs.map((tab) => tab.key)).toEqual(["payments"]);
		expect(desk.railSections(null)).toEqual([]);
	});
});

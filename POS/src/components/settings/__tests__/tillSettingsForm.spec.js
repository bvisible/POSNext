/**
 * //// Neoffice — added file (no upstream equivalent). The rules of the till's settings screen, from the list alone
 * //// (NeoRestau lot 1, task 13): the rail of tabs, the columns of a tab, when a setting is greyed, what a save
 * //// sends, what the till must take again once it is saved.
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest"
import {
	STOCK_SYNC_KEY,
	changedValues,
	columnsOf,
	conditionsHold,
	effectsOf,
	isOn,
	openingTab,
	railSections,
	readStockSync,
	withinBounds,
} from "../tillSettingsForm"

const screen = {
	tabs: [
		{ key: "restaurant", section: "restaurant" },
		{ key: "general", section: "till" },
		{ key: "stock", section: "till" },
	],
	groups: [
		{ key: "lock", tab: "general", column: 1 },
		{ key: "display", tab: "general", column: 3 },
		{ key: "customer", tab: "general", column: 2 },
		{ key: "empty", tab: "general", column: 2 },
	],
	settings: [
		{ key: "enable_session_lock", group: "lock", store: "document", editable: true },
		{ key: "session_lock_timeout", group: "lock", store: "document", editable: true },
		{ key: "enable_customer_display", group: "display", store: "document", editable: true },
		{ key: "customer", group: "customer", store: "document", editable: true, applies: "profile" },
		{ key: "item_groups", group: "customer", store: "document", editable: true, applies: "catalogue" },
		{ key: "enable_runner", group: "customer", store: "document", editable: false, applies: "restaurant" },
		{ key: "stock_sync_enabled", group: "lock", store: "device", editable: true },
	],
}

describe("the rail and the columns", () => {
	it("puts the restaurant's tabs before the till's, and leaves out an empty section", () => {
		expect(railSections(screen).map((section) => section.key)).toEqual(["restaurant", "till"])
		expect(railSections({ tabs: screen.tabs.slice(1) }).map((section) => section.key)).toEqual(["till"])
	})

	it("opens on the tab asked for when the screen has it, else on the first", () => {
		expect(openingTab(screen, "stock")).toBe("stock")
		expect(openingTab(screen, "hours")).toBe("restaurant")
		expect(openingTab(screen, "")).toBe("restaurant")
	})

	it("lays the groups of a tab in their columns, in order, and drops a group with nothing to show", () => {
		const columns = columnsOf(screen, "general")

		expect(columns.map((column) => column.map((group) => group.key))).toEqual([
			["lock"],
			["customer"],
			["display"],
		])
		expect(columns[0][0].settings.map((setting) => setting.key)).toEqual([
			"enable_session_lock",
			"session_lock_timeout",
			"stock_sync_enabled",
		])
	})
})

describe("when a setting is greyed", () => {
	it("counts a ticked box, a chosen link, a filled text and a non-empty list as on", () => {
		for (const value of [1, true, "Store", ["Drinks"], "6"]) expect(isOn(value)).toBe(true)
		for (const value of [0, false, "", "  ", "0", [], null, undefined]) expect(isOn(value)).toBe(false)
	})

	it("holds when every condition holds: on, equal to a value, off", () => {
		const setting = {
			depends_on: [
				{ key: "enable_qr_ordering", equals: null, off: false },
				{ key: "token_expiry_mode", equals: "Timed", off: false },
				{ key: "allow_credit_sale", equals: null, off: true },
			],
		}

		expect(
			conditionsHold(setting, { enable_qr_ordering: 1, token_expiry_mode: "Timed", allow_credit_sale: 0 })
		).toBe(true)
		expect(
			conditionsHold(setting, { enable_qr_ordering: 0, token_expiry_mode: "Timed", allow_credit_sale: 0 })
		).toBe(false)
		expect(
			conditionsHold(setting, { enable_qr_ordering: 1, token_expiry_mode: "On Payment", allow_credit_sale: 0 })
		).toBe(false)
		expect(
			conditionsHold(setting, { enable_qr_ordering: 1, token_expiry_mode: "Timed", allow_credit_sale: 1 })
		).toBe(false)
		expect(conditionsHold({ depends_on: [] }, {})).toBe(true)
	})
})

describe("what a save sends", () => {
	it("sends the values of the till's documents that changed, and nothing kept elsewhere", () => {
		const read = { enable_session_lock: 0, customer: "Walk-in", item_groups: [], stock_sync_enabled: 0 }
		const draft = { ...read, enable_session_lock: 1, item_groups: ["Drinks"], stock_sync_enabled: 1 }

		expect(changedValues(screen.settings, read, draft)).toEqual({
			enable_session_lock: 1,
			item_groups: ["Drinks"],
		})
	})

	it("never sends what the user may not change", () => {
		expect(changedValues(screen.settings, { enable_runner: 1 }, { enable_runner: 0 })).toEqual({})
	})

	it("says what the till must take again", () => {
		expect([...effectsOf(screen.settings, ["customer", "item_groups", "enable_session_lock"])].sort()).toEqual([
			"catalogue",
			"profile",
		])
	})

	it("keeps a number within its bounds", () => {
		expect(withinBounds({ min: 1, max: null }, 0)).toBe(false)
		expect(withinBounds({ min: 1, max: null }, 5)).toBe(true)
		expect(withinBounds({ min: 0, max: 100 }, 101)).toBe(false)
		expect(withinBounds({ min: null, max: null }, "abc")).toBe(false)
	})
})

describe("this computer's settings", () => {
	beforeEach(() => localStorage.clear())

	it("reads the stock sync this computer keeps, and its defaults without any", () => {
		expect(readStockSync()).toEqual({ stock_sync_enabled: 0, stock_sync_interval: 60 })
		localStorage.setItem(STOCK_SYNC_KEY, JSON.stringify({ enabled: true, intervalSeconds: 30 }))
		expect(readStockSync()).toEqual({ stock_sync_enabled: 1, stock_sync_interval: 30 })
	})
})

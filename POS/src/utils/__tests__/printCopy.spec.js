/**
 * //// Neoffice — added file (no upstream equivalent). The settings of the print button of the kitchen's and the runner's cards (NeoResto lot 1, task 44):
 * //// the button on the kitchen screen (on), the button on the runner screen (off), what prints (this station's lines, or the whole order) and the COPY mark
 * //// (on). Each has a default, the restaurant's value may replace it and the device's choice replaces that; and the button is drawn only where the
 * //// station has a printer, whatever the settings say.
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest"
import {
	buttonKey,
	cleanCopySetting,
	PRINT_COPY_DEFAULTS,
	PRINT_COPY_STORAGE_PREFIX,
	readDeviceCopySettings,
	resolveCopySettings,
	saveDeviceCopySetting,
	SCREEN_KITCHEN,
	SCREEN_RUNNER,
	showsThePrintButton,
	stationsAtTheKitchen,
} from "../printCopy"

beforeEach(() => localStorage.clear())

describe("the settings of the print button", () => {
	it("ship with a sensible default each: the kitchen's button on, the runner's off, the station's lines, marked as a copy", () => {
		expect(resolveCopySettings()).toEqual({
			kitchen_print_button: true,
			runner_print_button: false,
			print_scope: "station",
			mark_copy: true,
		})
		expect(Object.isFrozen(PRINT_COPY_DEFAULTS)).toBe(true)
	})

	it("take the restaurant's value over the default and the device's choice over both", () => {
		const settings = resolveCopySettings({
			restaurant: { runner_print_button: true, print_scope: "order" },
			device: { print_scope: "station", mark_copy: false },
		})

		expect(settings).toEqual({
			kitchen_print_button: true,
			runner_print_button: true,
			print_scope: "station",
			mark_copy: false,
		})
	})

	it("read a switch however the registry spells it, and ignore anything that is not a value of the setting", () => {
		expect(
			resolveCopySettings({
				restaurant: { kitchen_print_button: "0", runner_print_button: 1, mark_copy: "false" },
			}),
		).toMatchObject({ kitchen_print_button: false, runner_print_button: true, mark_copy: false })
		expect(
			resolveCopySettings({
				device: { kitchen_print_button: "maybe", print_scope: "everything", mark_copy: null, other: 1 },
			}),
		).toEqual(PRINT_COPY_DEFAULTS)
	})

	it("are kept on the device, one key each, beside the kitchen's other settings", () => {
		expect(saveDeviceCopySetting("runner_print_button", true)).toBe(true)
		expect(saveDeviceCopySetting("print_scope", "order")).toBe(true)
		expect(saveDeviceCopySetting("mark_copy", false)).toBe(true)

		expect(localStorage.getItem(`${PRINT_COPY_STORAGE_PREFIX}runner_print_button`)).toBe("1")
		expect(localStorage.getItem(`${PRINT_COPY_STORAGE_PREFIX}print_scope`)).toBe("order")
		expect(localStorage.getItem(`${PRINT_COPY_STORAGE_PREFIX}mark_copy`)).toBe("0")
		expect(readDeviceCopySettings()).toEqual({
			runner_print_button: true,
			print_scope: "order",
			mark_copy: false,
		})
	})

	it("refuse a key that is not a setting and a value that is not one of it", () => {
		expect(saveDeviceCopySetting("keep_screen_on", true)).toBe(false)
		expect(saveDeviceCopySetting("print_scope", "all of it")).toBe(false)
		expect(cleanCopySetting("mark_copy", "yes please")).toBeUndefined()
		expect(cleanCopySetting("print_scope", "order")).toBe("order")
		expect(localStorage.length).toBe(0)
	})

	it("stand on their defaults where the storage refuses (a private window, site data blocked)", () => {
		const refusing = {
			getItem: () => {
				throw new Error("blocked")
			},
			setItem: () => {
				throw new Error("blocked")
			},
		}

		expect(readDeviceCopySettings(refusing)).toEqual({})
		expect(saveDeviceCopySetting("mark_copy", false, refusing)).toBe(false)
		expect(readDeviceCopySettings(null)).toEqual({})
	})

	it("name the setting that puts the button on each screen", () => {
		expect(buttonKey(SCREEN_KITCHEN)).toBe("kitchen_print_button")
		expect(buttonKey(SCREEN_RUNNER)).toBe("runner_print_button")
	})
})

describe("the stations a ticket can print on", () => {
	it("are those of the dishes that are at the kitchen: not held back, not delivered, and with a station", () => {
		const items = [
			{ preparation_station: "grill", kds_status: "Pending" },
			{ preparation_station: "bar", kds_status: "Ready" },
			{ preparation_station: "pastry", kds_status: "Waiting" },
			{ preparation_station: "salad", kds_status: "Delivered" },
			{ preparation_station: "", kds_status: "Pending" },
			{ kds_status: "Pending" },
			{ preparation_station: "grill", kds_status: "Preparing" },
			{ preparation_station: "unsent", kds_status: "" },
		]

		expect(stationsAtTheKitchen(items)).toEqual(["grill", "bar"])
		expect(stationsAtTheKitchen(undefined)).toEqual([])
	})
})

describe("the print button of a card", () => {
	const ticket = ["grill", "bar"]
	const kitchen = resolveCopySettings()

	const shown = (what = {}) =>
		showsThePrintButton({
			screen: SCREEN_KITCHEN,
			settings: kitchen,
			printerStations: ["grill"],
			stations: ticket,
			station: null,
			...what,
		})

	it("is drawn on the kitchen screen where the station has a printer", () => {
		expect(shown({ station: "grill" })).toBe(true)
	})

	it("is hidden where the station the screen is opened on has no printer, whatever the other stations have", () => {
		expect(shown({ station: "bar" })).toBe(false)
		expect(shown({ station: "grill", printerStations: ["bar"] })).toBe(false)
		expect(shown({ station: "grill", printerStations: [] })).toBe(false)
	})

	it("is drawn on a screen that shows every station when a station of the ticket has a printer", () => {
		expect(shown()).toBe(true)
		expect(shown({ printerStations: ["pastry"] })).toBe(false)
		expect(shown({ stations: [] })).toBe(false)
	})

	it("is off on the runner screen until the setting is switched on", () => {
		const runner = { screen: SCREEN_RUNNER, station: "grill" }

		expect(shown({ ...runner, settings: kitchen })).toBe(false)
		expect(shown({ ...runner, settings: resolveCopySettings({ device: { runner_print_button: true } }) })).toBe(true)
	})

	it("is hidden on the kitchen screen when the setting is switched off, printer or not", () => {
		const off = resolveCopySettings({ device: { kitchen_print_button: false } })

		expect(shown({ settings: off, station: "grill" })).toBe(false)
	})

	it("is hidden for a station the server said, when it was asked to print, has no printer; and for all of them", () => {
		expect(shown({ station: "grill", withoutPrinter: ["grill"] })).toBe(false)
		expect(shown({ withoutPrinter: ["grill"] })).toBe(false)
		expect(shown({ station: "grill", withoutPrinter: ["bar"] })).toBe(true)
		expect(shown({ station: "grill", withoutPrinter: ["*"] })).toBe(false)
	})
})

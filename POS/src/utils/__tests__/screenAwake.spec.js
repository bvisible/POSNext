/**
 * //// Neoffice — added file (no upstream equivalent). The settings of "keep the screen on" and "rest the screen" (NeoResto lot 1, task 47): their
 * //// defaults in ONE small module, the layers that can override them (the restaurant's, later; the device's, now), the per-device storage that must work
 * //// when the browser refuses it, and the rule that says a ticket is NEW.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	hasNewTicket,
	KEEP_SCREEN_ON_SCREENS,
	readDeviceSettings,
	REST_STYLES,
	resolveSettings,
	SCREEN_AWAKE_DEFAULTS,
	SCREEN_AWAKE_KEYS,
	SCREEN_AWAKE_STORAGE_PREFIX,
	saveDeviceSetting,
	ticketCounts,
} from "../screenAwake"

beforeEach(() => {
	localStorage.clear()
})
afterEach(() => {
	vi.restoreAllMocks()
})

describe("the defaults of the awake settings", () => {
	it("are named by the five keys the restaurant's registry will take over, and nothing else", () => {
		expect(SCREEN_AWAKE_KEYS).toEqual([
			"keep_screen_on",
			"rest_after_minutes",
			"wake_on_new_ticket",
			"release_wake_lock_after_minutes",
			"rest_style",
		])
		expect(Object.keys(SCREEN_AWAKE_DEFAULTS).sort()).toEqual(
			[...SCREEN_AWAKE_KEYS].sort(),
		)
	})

	it("rest after 30 minutes, wake on a new ticket, and never let the device sleep by itself", () => {
		expect(SCREEN_AWAKE_DEFAULTS.rest_after_minutes).toBe(30)
		expect(SCREEN_AWAKE_DEFAULTS.wake_on_new_ticket).toBe(true)
		expect(SCREEN_AWAKE_DEFAULTS.release_wake_lock_after_minutes).toBe(0)
	})

	it("rest as a clock, unless the device is set to go black (Daniel, 01.11: the clock BIG, or the screen dark)", () => {
		expect(SCREEN_AWAKE_DEFAULTS.rest_style).toBe("clock")
		expect(REST_STYLES).toEqual(["clock", "black"])
		expect(resolveSettings({ device: { rest_style: "black" } }).rest_style).toBe("black")
		expect(resolveSettings({ restaurant: { rest_style: "black" }, device: { rest_style: "clock" } }).rest_style).toBe("clock")
		// a word that is no style is no choice: the layer below stands
		expect(resolveSettings({ restaurant: { rest_style: "black" }, device: { rest_style: "disco" } }).rest_style).toBe("black")
		expect(resolveSettings({ device: { rest_style: 3 } }).rest_style).toBe("clock")
	})

	it("keeps the style on the device as the word it is", () => {
		expect(saveDeviceSetting("rest_style", "black")).toBe(true)
		expect(localStorage.getItem(`${SCREEN_AWAKE_STORAGE_PREFIX}rest_style`)).toBe("black")
		expect(readDeviceSettings()).toMatchObject({ rest_style: "black" })
		expect(saveDeviceSetting("rest_style", "disco")).toBe(false)
	})

	it("keep the screen on is ON on the kitchen, the runner and the customer display, and OFF anywhere else", () => {
		expect(KEEP_SCREEN_ON_SCREENS).toEqual(["kitchen", "runner", "display"])
		for (const screen of ["kitchen", "runner", "display"])
			expect(resolveSettings({ screen }).keep_screen_on).toBe(true)
		for (const screen of ["till", "takeaway", "", undefined, "anything"])
			expect(resolveSettings({ screen }).keep_screen_on).toBe(false)
	})
})

describe("the layers of the settings", () => {
	it("the restaurant's values replace the defaults, the device's replace the restaurant's", () => {
		const settings = resolveSettings({
			screen: "kitchen",
			restaurant: { rest_after_minutes: 10, wake_on_new_ticket: false },
			device: { rest_after_minutes: 5 },
		})

		expect(settings).toEqual({
			keep_screen_on: true,
			rest_after_minutes: 5,
			wake_on_new_ticket: false,
			release_wake_lock_after_minutes: 0,
			rest_style: "clock",
		})
	})

	it("0 minutes is a value (never), not a missing one", () => {
		const settings = resolveSettings({
			screen: "runner",
			restaurant: { rest_after_minutes: 15 },
			device: { rest_after_minutes: 0 },
		})

		expect(settings.rest_after_minutes).toBe(0)
	})

	it("a value that is not one of the setting is ignored, the layer below stands", () => {
		const settings = resolveSettings({
			screen: "kitchen",
			restaurant: { rest_after_minutes: 20 },
			device: {
				rest_after_minutes: "soon",
				release_wake_lock_after_minutes: -5,
				keep_screen_on: "maybe",
				wake_on_new_ticket: null,
				unknown_key: 1,
			},
		})

		expect(settings.rest_after_minutes).toBe(20)
		expect(settings.release_wake_lock_after_minutes).toBe(0)
		expect(settings.keep_screen_on).toBe(true)
		expect(settings.wake_on_new_ticket).toBe(true)
		expect(settings).not.toHaveProperty("unknown_key")
	})

	it("reads the ways a registry spells a switch (1, 0, '1', 'true', 'false') and rounds minutes down to a whole number", () => {
		const settings = resolveSettings({
			screen: "till",
			restaurant: {
				keep_screen_on: "1",
				wake_on_new_ticket: 0,
				rest_after_minutes: "12",
				release_wake_lock_after_minutes: 7.9,
			},
		})

		expect(settings).toEqual({
			keep_screen_on: true,
			wake_on_new_ticket: false,
			rest_after_minutes: 12,
			release_wake_lock_after_minutes: 7,
			rest_style: "clock",
		})
		expect(
			resolveSettings({
				screen: "kitchen",
				device: { keep_screen_on: "false" },
			}).keep_screen_on,
		).toBe(false)
	})

	it("caps a number of minutes at a day, so that a typo never means 'never'", () => {
		expect(
			resolveSettings({
				screen: "kitchen",
				device: { rest_after_minutes: 999999 },
			}).rest_after_minutes,
		).toBe(1440)
	})
})

describe("the settings kept on this device", () => {
	it("reads nothing from an empty device", () => {
		expect(readDeviceSettings()).toEqual({})
	})

	it("keeps each setting under its own key and reads it back, with its type", () => {
		expect(saveDeviceSetting("rest_after_minutes", 15)).toBe(true)
		expect(saveDeviceSetting("keep_screen_on", false)).toBe(true)
		expect(saveDeviceSetting("wake_on_new_ticket", true)).toBe(true)
		expect(saveDeviceSetting("release_wake_lock_after_minutes", 60)).toBe(true)

		expect(
			localStorage.getItem(`${SCREEN_AWAKE_STORAGE_PREFIX}rest_after_minutes`),
		).toBe("15")
		expect(readDeviceSettings()).toEqual({
			rest_after_minutes: 15,
			keep_screen_on: false,
			wake_on_new_ticket: true,
			release_wake_lock_after_minutes: 60,
		})
	})

	it("refuses a key that is not a setting and a value that is not one of it", () => {
		expect(saveDeviceSetting("brightness", 3)).toBe(false)
		expect(saveDeviceSetting("rest_after_minutes", "soon")).toBe(false)
		expect(saveDeviceSetting("keep_screen_on", "maybe")).toBe(false)
		expect(localStorage.length).toBe(0)
	})

	it("ignores what the device holds that is not a setting's value", () => {
		localStorage.setItem(
			`${SCREEN_AWAKE_STORAGE_PREFIX}rest_after_minutes`,
			"soon",
		)
		localStorage.setItem(`${SCREEN_AWAKE_STORAGE_PREFIX}keep_screen_on`, "1")

		expect(readDeviceSettings()).toEqual({ keep_screen_on: true })
	})

	it("works when the storage refuses: reads the defaults, and says it could not keep the value", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("denied")
		})
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("denied")
		})

		expect(readDeviceSettings()).toEqual({})
		expect(saveDeviceSetting("rest_after_minutes", 10)).toBe(false)
		expect(
			resolveSettings({ screen: "kitchen", device: readDeviceSettings() })
				.rest_after_minutes,
		).toBe(30)
	})

	it("works when even the property 'localStorage' throws on access (a sandboxed frame, site data blocked)", () => {
		const real = Object.getOwnPropertyDescriptor(window, "localStorage")
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			get() {
				throw new Error("SecurityError")
			},
		})
		try {
			expect(readDeviceSettings()).toEqual({})
			expect(saveDeviceSetting("rest_after_minutes", 10)).toBe(false)
		} finally {
			if (real) Object.defineProperty(window, "localStorage", real)
		}
	})

	it("works with no storage at all (null)", () => {
		expect(readDeviceSettings(null)).toEqual({})
		expect(saveDeviceSetting("rest_after_minutes", 10, null)).toBe(false)
	})
})

describe("what a new ticket is", () => {
	const order = (name, ...statuses) => ({
		name,
		items: statuses.map((kds_status, i) => ({
			name: `${name}-${i}`,
			kds_status,
		})),
	})

	it("counts the dishes still alive on each ticket (pending, preparing, ready), not the delivered ones", () => {
		expect(
			ticketCounts([
				order("A", "Pending", "Preparing", "Delivered"),
				order("B", "Ready"),
			]),
		).toEqual({ A: 2, B: 1 })
	})

	it("leaves out a ticket with no live dish", () => {
		expect(ticketCounts([order("A", "Delivered"), order("B")])).toEqual({})
	})

	it("counts every line when the screen sends only live ones (the runner's), whatever their status", () => {
		expect(
			ticketCounts([{ name: "A", items: [{ qty: 2 }, { qty: 1 }] }], {
				live: () => true,
			}),
		).toEqual({ A: 2 })
	})

	it("survives nothing and nonsense", () => {
		expect(ticketCounts(undefined)).toEqual({})
		expect(ticketCounts([null, {}, { name: "A" }])).toEqual({})
	})

	it("is a ticket the screen has not seen", () => {
		expect(hasNewTicket({ A: 1 }, { A: 1, B: 1 })).toBe(true)
	})

	it("is also a dish added to a ticket the screen knew (a table served in rounds)", () => {
		expect(hasNewTicket({ A: 1 }, { A: 2 })).toBe(true)
	})

	it("is not a ticket that left, a dish that was delivered, or the same screen read again", () => {
		expect(hasNewTicket({ A: 2, B: 1 }, { A: 1 })).toBe(false)
		expect(hasNewTicket({ A: 1 }, { A: 1 })).toBe(false)
		expect(hasNewTicket({ A: 1 }, {})).toBe(false)
	})

	it("is never the first reading of a screen: it only sets what the next ones are compared with", () => {
		expect(hasNewTicket(null, { A: 1 })).toBe(false)
		expect(hasNewTicket(undefined, { A: 1 })).toBe(false)
	})
})

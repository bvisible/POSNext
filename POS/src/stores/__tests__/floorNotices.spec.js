/**
 * //// Neoffice — added file (no upstream equivalent). What the till does when a guest orders or pays from the QR code of a table (NeoResto lot 1, Daniel, 01.11: « regarde comment la caisse sommelier reçoit
 * //// l'info (popup et autre) »): a notice per table in a small stack, the sound the till chose once per event at the volume it set, and nothing at all for an event that is no news. All of it follows the till's own
 * //// settings (`floor_guest_popup`, `floor_popup_seconds`, `floor_guest_sound`, `kitchen_alert_volume`), read from the settings store with the defaults for a till that does not carry them yet.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const player = vi.hoisted(() => {
	globalThis.__ = (text) => text
	return { play: vi.fn(() => true) }
})
vi.mock("@/utils/alertSoundPlayer", () => ({ playAlertSound: player.play }))
vi.mock("@/stores/posSettings", async () => {
	const { reactive } = await import("vue")
	const settings = reactive({})
	return { usePOSSettingsStore: () => ({ settings }), tillSettings: settings }
})

const { tillSettings } = await import("@/stores/posSettings")
const { useFloorNoticesStore } = await import("../floorNotices")

const WINE = { item_name: "Verre de vin", qty: 3 }
const order = (over = {}) => ({
	restaurant: "The Bistro",
	table: "t-2",
	invoice: "ACC-1",
	items_count: 1,
	items: [WINE],
	count: 1,
	validation_mode: "Direct to Kitchen",
	...over,
})
const pending = (over = {}) => order({ validation_mode: "Server Approval", ...over })

let store

beforeEach(() => {
	vi.useFakeTimers()
	player.play.mockClear()
	for (const key of Object.keys(tillSettings)) delete tillSettings[key]
	setActivePinia(createPinia())
	store = useFloorNoticesStore()
})
afterEach(() => {
	vi.useRealTimers()
})

describe("a guest orders", () => {
	it("makes a notice that names the table and the lines of the order", () => {
		store.tell("order", order())

		expect(store.notices).toHaveLength(1)
		expect(store.notices[0]).toMatchObject({ kind: "order", table: "t-2", items: [WINE], count: 1 })
	})

	it("rings the chime once, at the medium volume, when the till's settings say nothing", () => {
		store.tell("order", order())

		expect(player.play).toHaveBeenCalledTimes(1)
		expect(player.play).toHaveBeenCalledWith("chime", "medium")
	})

	it("rings the sound the till chose, at the volume the till set", () => {
		Object.assign(tillSettings, { floor_guest_sound: "Gong", kitchen_alert_volume: "High" })

		store.tell("order", order())

		expect(player.play).toHaveBeenCalledWith("gong", "high")
	})

	it("rings for each event, however many tables order together", () => {
		store.tell("order", order({ table: "t-1" }))
		store.tell("order", order({ table: "t-2" }))

		expect(player.play).toHaveBeenCalledTimes(2)
		// In the order they came: the oldest on top
		expect(store.notices.map((notice) => notice.table)).toEqual(["t-1", "t-2"])
	})

	it("is silent for a sound of none, and still shows the notice", () => {
		tillSettings.floor_guest_sound = "None"

		store.tell("order", order())

		expect(player.play).not.toHaveBeenCalled()
		expect(store.notices).toHaveLength(1)
		expect(store.soundOn).toBe(false)
	})

	it("only rings, with the popup off: no notice at all", () => {
		tillSettings.floor_guest_popup = 0

		store.tell("order", order())

		expect(store.notices).toEqual([])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("does nothing for an order that added no line: nothing new, nothing to ring for", () => {
		store.tell("order", order({ items: [], count: 0 }))

		expect(store.notices).toEqual([])
		expect(player.play).not.toHaveBeenCalled()
	})

	it("does nothing for an alert that names no table", () => {
		store.tell("order", order({ table: "" }))

		expect(store.notices).toEqual([])
		expect(player.play).not.toHaveBeenCalled()
	})

	it("keeps ONE notice per table: a second order of the table replaces the first", () => {
		store.tell("order", order({ items: [WINE] }))
		const first = store.notices[0].key
		store.tell("order", order({ items: [{ item_name: "Pizza", qty: 1 }] }))

		expect(store.notices).toHaveLength(1)
		expect(store.notices[0].key).not.toBe(first)
		expect(store.notices[0].items).toEqual([{ item_name: "Pizza", qty: 1 }])
		expect(player.play).toHaveBeenCalledTimes(2)
	})
})

describe("how long a notice stays", () => {
	//// Neoffice — until somebody has seen it, by default (Daniel, 02.11: the glass of wine ordered at table 7 disappeared on its own)
	it("until somebody has seen it, by default: a day later it is still there", () => {
		store.tell("order", order())

		vi.advanceTimersByTime(24 * 3600 * 1000)

		expect(store.notices).toHaveLength(1)
		store.dismiss(store.notices[0].key)
		expect(store.notices).toEqual([])
	})

	it("the seconds the till set", () => {
		tillSettings.floor_popup_seconds = 5

		store.tell("order", order())
		vi.advanceTimersByTime(5000)

		expect(store.notices).toEqual([])
	})

	it("until it is dismissed, for 0 seconds", () => {
		tillSettings.floor_popup_seconds = 0

		store.tell("order", order())
		vi.advanceTimersByTime(24 * 3600 * 1000)

		expect(store.notices).toHaveLength(1)
	})

	it("counts its seconds from the notice that replaced it: the older notice's timer does not take the newer away", () => {
		tillSettings.floor_popup_seconds = 10
		store.tell("order", order())
		vi.advanceTimersByTime(8000)
		store.tell("order", order({ items: [{ item_name: "Pizza", qty: 1 }] }))

		vi.advanceTimersByTime(3000)

		expect(store.notices).toHaveLength(1)
		vi.advanceTimersByTime(7000)
		expect(store.notices).toEqual([])
	})

	it("forgets the timer of a notice that another took the place of: one live timer per notice on the screen", () => {
		tillSettings.floor_popup_seconds = 30
		store.tell("order", order({ table: "t-1" }))
		store.tell("order", order({ table: "t-1", items: [{ item_name: "Pizza", qty: 1 }] }))
		store.tell("order", order({ table: "t-1", items: [{ item_name: "Soupe", qty: 1 }] }))

		expect(store.notices).toHaveLength(1)
		expect(vi.getTimerCount()).toBe(1)
	})

	it("a payment stays as long as an order", () => {
		tillSettings.floor_popup_seconds = 30
		store.tell("payment", { table: "t-2", submitted: true })

		vi.advanceTimersByTime(30_000)

		expect(store.notices).toEqual([])
	})

	it("a payment stays until somebody has seen it, by default, as an order does", () => {
		store.tell("payment", { table: "t-2", submitted: true })

		vi.advanceTimersByTime(24 * 3600 * 1000)

		expect(store.notices).toHaveLength(1)
	})

	it("an order the waiter has to validate stays until it is handled or dismissed, whatever the seconds", () => {
		tillSettings.floor_popup_seconds = 5

		store.tell("order", pending())
		vi.advanceTimersByTime(24 * 3600 * 1000)

		expect(store.notices).toHaveLength(1)
		expect(store.notices[0].kind).toBe("pending")
	})

	it("a notice goes when it is dismissed, and its timer with it", () => {
		store.tell("order", order())
		store.dismiss(store.notices[0].key)

		expect(store.notices).toEqual([])
		expect(vi.getTimerCount()).toBe(0)
	})

	it("all of them go when all are dismissed", () => {
		store.tell("order", order({ table: "t-1" }))
		store.tell("order", pending({ table: "t-2" }))

		store.dismissAll()

		expect(store.notices).toEqual([])
		expect(vi.getTimerCount()).toBe(0)
	})

	it("clears everything when the user leaves", () => {
		store.tell("order", order())

		store.clear()

		expect(store.notices).toEqual([])
		expect(vi.getTimerCount()).toBe(0)
	})
})

describe("a guest's order the waiter has to validate", () => {
	it("is a notice of its own kind, rung like the others", () => {
		store.tell("order", pending())

		expect(store.notices[0]).toMatchObject({ kind: "pending", orders: 1 })
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("adds up in one notice when the table orders again before it is handled, and rings again", () => {
		store.tell("order", pending({ items: [WINE], count: 1 }))
		store.tell("order", pending({ items: [{ item_name: "Pizza", qty: 1 }], count: 1 }))

		expect(store.notices).toHaveLength(1)
		expect(store.notices[0]).toMatchObject({ orders: 2, count: 2 })
		expect(player.play).toHaveBeenCalledTimes(2)
	})

	it("goes when the table has been seen with lines to accept and has none any more", () => {
		store.tell("order", pending())

		store.settle([{ name: "t-2", qr_waiting_count: 1 }])
		expect(store.notices).toHaveLength(1)
		store.settle([{ name: "t-2", qr_waiting_count: 0 }])

		expect(store.notices).toEqual([])
	})

	it("stays when the first reading of the floor already says none", () => {
		store.tell("order", pending())

		store.settle([{ name: "t-2", qr_waiting_count: 0 }])

		expect(store.notices).toHaveLength(1)
	})

	it("is not touched by a reading of the floor while it is a plain order", () => {
		tillSettings.floor_popup_seconds = 0
		store.tell("order", order())

		store.settle([{ name: "t-2", qr_waiting_count: 1 }])
		store.settle([{ name: "t-2", qr_waiting_count: 0 }])

		expect(store.notices).toHaveLength(1)
	})
})

describe("a guest pays", () => {
	it("makes a notice that says the table, rings, and is not an order", () => {
		store.tell("payment", { restaurant: "The Bistro", table: "t-2", invoice: "ACC-1", paid_amount: 30, grand_total: 30, submitted: true })

		expect(store.notices[0]).toMatchObject({ kind: "payment", table: "t-2", partial: false })
		expect(player.play).toHaveBeenCalledWith("chime", "medium")
	})

	it("follows the same settings: popup off is a sound only, none is a notice only", () => {
		tillSettings.floor_guest_popup = 0
		store.tell("payment", { table: "t-2", submitted: true })
		expect(store.notices).toEqual([])
		expect(player.play).toHaveBeenCalledTimes(1)
	})
})

describe("the waiter has the paid table in front of him", () => {
	const pays = (table) => store.tell("payment", { restaurant: "The Bistro", table, invoice: `ACC-${table}`, paid_amount: 30, grand_total: 30, submitted: true })

	it("takes the « the guest paid » notice of that table away", () => {
		pays("t-2")

		store.dismissPaymentsOf("t-2")

		expect(store.notices).toEqual([])
	})

	it("leaves the notice of another table, and an order of that table that is still to validate", () => {
		pays("t-2")
		pays("t-5")
		store.tell("order", pending({ table: "t-7" }))

		store.dismissPaymentsOf("t-2")

		expect(store.notices.map((notice) => `${notice.table}:${notice.kind}`).sort()).toEqual(["t-5:payment", "t-7:pending"])
	})

	it("does nothing for a table that has no notice", () => {
		pays("t-5")

		store.dismissPaymentsOf("t-9")

		expect(store.notices).toHaveLength(1)
	})
})

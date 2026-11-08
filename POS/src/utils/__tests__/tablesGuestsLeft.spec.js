//// Neoffice — added file (no upstream equivalent). A table that went to Cleaning by itself and has waited for the restaurant's minutes is « Guests left? » in the list of
//// tables (the product owner, 08.11.2026: « une pastille Partis ? »; the floor's read tells it, `guests_left_ask`). It is a table with something going on, last of them.
import { describe, expect, it } from "vitest"

globalThis.__ = (text, args) => (args || []).reduce((s, arg, at) => s.replace(`{${at}}`, arg), text)

const { tablesOfTheService, ALL_ROOMS } = await import("../tablesOfTheService.js")

const ROOM = { name: "r00m1h4sh", area_name: "Salle 1" }
const WALL = Date.UTC(2026, 10, 8, 21, 0, 0)
function table(name, label, status, extra = {}) {
	return {
		name,
		table_name: label,
		area: ROOM.name,
		status,
		capacity: 4,
		waiting_items_count: 0,
		qr_waiting_count: 0,
		order_summary: null,
		...extra,
	}
}
function list(tables) {
	return tablesOfTheService({
		tables,
		areas: [ROOM],
		runnerOrders: [],
		reservations: [],
		now: new Date(WALL - 60 * 60000),
		timezone: "Europe/Zurich",
		room: ALL_ROOMS,
		search: "",
	})
}
const titles = (entries) => entries.map((entry) => entry.title)

describe("a table to clean that the guests may not have left, in the list", () => {
	it("is badged « Guests left? » in the amber tone, in a tier of its own", () => {
		const { busy } = list([table("t1", "Table 1", "Cleaning", { guests_left_ask: true, cleaning_minutes: 40 })])

		expect(busy).toHaveLength(1)
		expect(busy[0].tier).toBe("askleft")
		expect(busy[0].badge).toEqual({ text: "Guests left?", tone: "tocash" })
	})

	it("is a plain table to clean when the floor does not ask, and stays among the others", () => {
		const { busy, others } = list([table("t1", "Table 1", "Cleaning", { guests_left_ask: false, cleaning_minutes: 5 })])

		expect(busy).toEqual([])
		expect(others[0].tier).toBe("cleaning")
		expect(others[0].badge.text).toBe("Cleaning")
	})

	it("is never asked for a table of direct service", () => {
		const { busy } = list([table("t1", "Bar", "Cleaning", { guests_left_ask: true, direct_service: 1 })])

		expect(busy).toEqual([])
	})

	it("comes after the tables paid and occupied", () => {
		const { busy } = list([
			table("t-left", "Left", "Cleaning", { guests_left_ask: true }),
			table("t-paid", "Paid", "Paid"),
			table("t-occ", "Occ", "Occupied", {
				order_summary: { item_count: 1, opened_at: "2026-11-08 20:00:00.000000", opened_by: "LM", kds_status: "Pending" },
			}),
		])

		expect(titles(busy)).toEqual(["Occ", "Paid", "Left"])
	})

	it("counts as a table with something going on in « All »", () => {
		const floor = list([table("t1", "Table 1", "Cleaning", { guests_left_ask: true })])

		expect(floor.activeCount).toBe(1)
	})

	it("offers no QR code from its card: nobody is seated for the guests to order", () => {
		const { busy } = list([table("t1", "Table 1", "Cleaning", { guests_left_ask: true })])

		expect(busy[0].qr).toBe(false)
	})
})

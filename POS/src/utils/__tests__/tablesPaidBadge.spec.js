//// Neoffice — added file (no upstream equivalent). A table whose bill is settled while dishes are still to serve stays Occupied; the list of tables says « Paid » on it, as the plan's tile does
//// (the product owner, 08.11.2026: seen on a table paid at the till with two dishes at the kitchen, whose list badge read « Occupied »). The floor's read tells it, `order_summary.paid`.
import { describe, expect, it } from "vitest"

globalThis.__ = (text, args) => (args || []).reduce((s, arg, at) => s.replace(`{${at}}`, arg), text)

const { tablesOfTheService, ALL_ROOMS } = await import("../tablesOfTheService.js")

const ROOM = { name: "r00m1h4sh", area_name: "Salle 1" }
const WALL = Date.UTC(2026, 10, 8, 21, 0, 0)
function occupied(name, label, summary = {}) {
	return {
		name,
		table_name: label,
		area: ROOM.name,
		status: "Occupied",
		capacity: 4,
		waiting_items_count: 0,
		qr_waiting_count: 0,
		order_summary: {
			item_count: 2,
			opened_at: "2026-11-08 20:00:00.000000",
			opened_by: "LM",
			kds_status: "Pending",
			grand_total: 28,
			...summary,
		},
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

describe("a table paid with dishes still to serve, in the list", () => {
	it("is badged « Paid » in the paid tone and keeps its place among the occupied tables", () => {
		const { busy } = list([occupied("t1", "Table 1", { paid: true })])

		expect(busy[0].tier).toBe("occupied")
		expect(busy[0].badge).toEqual({ text: "Paid", tone: "paid" })
	})

	it("stays « Occupied » while its bill is not settled", () => {
		const { busy } = list([occupied("t1", "Table 1")])

		expect(busy[0].badge.text).toBe("Occupied")
	})
})

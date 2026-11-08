//// Neoffice — added file (no upstream equivalent). A table where everything is served and nothing has moved for the restaurant's minutes is « Cash in? » in the list
//// of tables (the product owner, 08.11.2026: « le serveur a oublié de fermer la table »; the floor's read tells it, `order_summary.to_cash_in`). It comes after the tables
//// with something to do (dishes ready, a QR order to accept) and before the other occupied ones.
import { describe, expect, it } from "vitest"

globalThis.__ = (text, args) => (args || []).reduce((s, arg, at) => s.replace(`{${at}}`, arg), text)

const { tablesOfTheService, ALL_ROOMS } = await import("../tablesOfTheService.js")

const ROOM = { name: "r00m1h4sh", area_name: "Salle 1" }
const WALL = Date.UTC(2026, 10, 8, 21, 0, 0)
const pad = (n) => String(n).padStart(2, "0")
function serverText(wall) {
	const at = new Date(wall)
	return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())} ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:00.000000`
}
function occupied(name, label, minutesAgo, summary = {}, extra = {}) {
	return {
		name,
		table_name: label,
		area: ROOM.name,
		status: "Occupied",
		capacity: 4,
		waiting_items_count: 0,
		qr_waiting_count: 0,
		order_summary: { item_count: 2, opened_at: serverText(WALL - minutesAgo * 60000), opened_by: "LM", kds_status: "Delivered", grand_total: 40, ...summary },
		...extra,
	}
}
function list(tables, runnerOrders = []) {
	return tablesOfTheService({
		tables,
		areas: [ROOM],
		runnerOrders,
		reservations: [],
		now: new Date(WALL - 60 * 60000),
		timezone: "Europe/Zurich",
		room: ALL_ROOMS,
		search: "",
	})
}
const titles = (entries) => entries.map((entry) => entry.title)

describe("a table to cash in, in the list", () => {
	it("is badged « Cash in? » in the amber tone, in a tier of its own", () => {
		const { busy } = list([occupied("t1", "Table 1", 90, { to_cash_in: true, served: true, idle_minutes: 50 })])

		expect(busy).toHaveLength(1)
		expect(busy[0].tier).toBe("tocash")
		expect(busy[0].badge).toEqual({ text: "Cash in?", tone: "tocash" })
	})

	it("is not one when the floor does not say so, and the table keeps its plain badge", () => {
		const { busy } = list([occupied("t1", "Table 1", 90, { served: true, idle_minutes: 10, to_cash_in: false })])

		expect(busy[0].tier).toBe("occupied")
		expect(busy[0].badge.text).toBe("Occupied")
	})

	it("comes after the tables with dishes ready and with a QR order to accept, and before the other occupied ones", () => {
		const tables = [
			occupied("t-plain", "Plain", 200),
			occupied("t-cash", "Cash", 100, { to_cash_in: true }),
			occupied("t-qr", "Qr", 5, {}, { qr_waiting_count: 2 }),
			occupied("t-ready", "Ready", 5),
		]
		const ready = { name: "SINV-ready", restaurant_table: "t-ready", items: [{ name: "l1", station_type: "Kitchen" }] }

		const { busy } = list(tables, [ready])

		expect(titles(busy)).toEqual(["Ready", "Qr", "Cash", "Plain"])
	})

	it("keeps the table's QR code reachable from its card", () => {
		const { busy } = list([occupied("t1", "Table 1", 90, { to_cash_in: true })])

		expect(busy[0].qr).toBe(true)
	})

	it("counts as a busy table in « All »", () => {
		const floor = list([occupied("t1", "Table 1", 90, { to_cash_in: true })])

		expect(floor.activeCount).toBe(1)
	})
})

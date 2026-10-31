//// Neoffice — added file (no upstream equivalent). The list of tables a waiter opens on his phone (NeoRestau lot 1,
//// task 26): every table of the restaurant, sorted by what needs him first. Dishes ready at the pass, then a QR order
//// waiting for him to accept it, then the other occupied tables, the one seated longest first; then « Soon », the
//// reservations that arrive within the hour; then the free tables and the tables being cleaned, so that « All » can
//// find any table. Each badge says what the data says, and only that (Ruling 66: what a later lot brings is left out).
import { describe, expect, it } from "vitest"

globalThis.__ = (text, args = [], context) => {
	const out = (args || []).reduce(
		(s, arg, at) => s.replace(`{${at}}`, arg),
		text,
	)
	return context ? `${out}` : out
}

const { tablesOfTheService, serverTime, ALL_ROOMS } = await import(
	"../tablesOfTheService.js"
)

const ROOM = { name: "r00m1h4sh", area_name: "Salle 1" }
const TERRACE = { name: "t3rr4c3h4", area_name: "Terrasse" }
// The service's clock: 19:58 on the 31st
const NOW = new Date(2026, 9, 31, 19, 58, 0)
const TODAY = "2026-10-31"

// A table as the floor's read gives it (get_tables), an order on it when it is occupied
function table(name, label, status = "Empty", extra = {}) {
	return {
		name,
		table_name: label,
		area: ROOM.name,
		status,
		capacity: 4,
		waiting_items_count: 0,
		qr_waiting_count: 0,
		...extra,
	}
}
function seated(minutesAgo, total = 0) {
	const at = new Date(NOW.getTime() - minutesAgo * 60000)
	const pad = (n) => String(n).padStart(2, "0")
	// The server's own way of writing a time: no zone, a space, microseconds
	const text = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:00.123456`
	return {
		item_count: 2,
		opened_at: text,
		opened_by: "LM",
		kds_status: "Pending",
		grand_total: total,
	}
}
function occupied(name, label, minutesAgo, extra = {}) {
	return table(name, label, "Occupied", {
		order_summary: seated(minutesAgo, 30),
		...extra,
	})
}
// The pass's orders (get_runner_orders): the ready lines of a table, each with the type of its station
function ready(tableName, ...types) {
	return {
		name: `SINV-${tableName}`,
		restaurant_table: tableName,
		items: types.map((station_type, at) => ({ name: `l${at}`, station_type })),
	}
}
function booking(name, time, guests, tables = [], status = "Confirmed") {
	return {
		name,
		status,
		reservation_date: TODAY,
		reservation_time: `${time}:00`,
		no_of_guests: guests,
		tables: tables.map((t) => ({
			restaurant_table: t.name,
			table_name: t.table_name,
			area: t.area,
		})),
	}
}

function service({
	tables = [],
	runnerOrders = [],
	reservations = [],
	room = ALL_ROOMS,
	areas = [ROOM, TERRACE],
} = {}) {
	return tablesOfTheService({
		tables,
		areas,
		runnerOrders,
		reservations,
		now: NOW,
		room,
	})
}
const titles = (entries) => entries.map((entry) => entry.title)

describe("the order of the list: what needs the waiter first", () => {
	it("puts the tables with dishes ready at the pass first, then a QR order to accept, then the others, the oldest seated first", () => {
		const tables = [
			occupied("t1", "Table 1", 10),
			occupied("t2", "Table 2", 50),
			occupied("t3", "Table 3", 90),
			occupied("t4", "Table 4", 5, {
				qr_waiting_count: 1,
				waiting_items_count: 1,
			}),
			occupied("t5", "Table 5", 20),
		]

		const list = service({
			tables,
			runnerOrders: [ready("t1", "Kitchen"), ready("t5", "Bar")],
		})

		// Ready first (oldest seated first among them), the QR order next, then the rest by how long they have been seated
		expect(titles(list.busy)).toEqual([
			"Table 5",
			"Table 1",
			"Table 4",
			"Table 3",
			"Table 2",
		])
		expect(list.busy.map((entry) => entry.tier)).toEqual([
			"ready",
			"ready",
			"qr",
			"occupied",
			"occupied",
		])
	})

	it("keeps a table ready at the pass in the first place even when a QR order waits on it too", () => {
		const list = service({
			tables: [
				occupied("t1", "Table 1", 10, {
					qr_waiting_count: 2,
					waiting_items_count: 2,
				}),
			],
			runnerOrders: [ready("t1", "Kitchen")],
		})

		expect(list.busy[0].tier).toBe("ready")
		// Its lines on hold are still said, as the plan says them
		expect(list.busy[0].waiting).toBe(2)
	})

	it("ends the occupied tables with the paid ones, which wait to be freed", () => {
		const list = service({
			tables: [table("t9", "Table 9", "Paid"), occupied("t1", "Table 1", 10)],
		})

		expect(titles(list.busy)).toEqual(["Table 1", "Table 9"])
		expect(list.busy[1].tier).toBe("paid")
	})

	it("lists the free tables, the tables being cleaned and the reserved ones after everything else, in the order of the plan", () => {
		const tables = [
			table("t10", "Table 10"),
			table("t2", "Table 2", "Cleaning"),
			table("tt1", "T1", "Empty", { area: TERRACE.name }),
			table("t1", "Table 1", "Reserved"),
			occupied("t3", "Table 3", 10),
		]

		const list = service({ tables })

		// The rooms in the plan's order, then the tables in their natural order (2 before 10)
		expect(titles(list.others)).toEqual([
			"Table 1",
			"Table 2",
			"Table 10",
			"T1",
		])
		expect(list.others.map((entry) => entry.tier)).toEqual([
			"reserved",
			"cleaning",
			"free",
			"free",
		])
		expect(titles(list.busy)).toEqual(["Table 3"])
	})

	it("puts a table whose seating time is not known after the ones whose time is", () => {
		const unknown = table("t8", "Table 8", "Occupied", {
			order_summary: { ...seated(0), opened_at: null },
		})
		const list = service({ tables: [unknown, occupied("t1", "Table 1", 10)] })

		expect(titles(list.busy)).toEqual(["Table 1", "Table 8"])
		expect(list.busy[1].minutes).toBeNull()
	})
})

describe("each badge from its data", () => {
	it("says « Dishes ready at the pass » when a ready line is a kitchen's", () => {
		const list = service({
			tables: [occupied("t1", "Table 1", 10)],
			runnerOrders: [ready("t1", "Bar", "Kitchen")],
		})

		expect(list.busy[0].badge).toEqual({
			text: "Dishes ready at the pass",
			tone: "ready",
		})
	})

	it("says only « Ready at the pass » for drinks, and for lines whose station says nothing", () => {
		for (const types of [["Bar"], ["Bar", "Bar"], [undefined], ["Other"]]) {
			const list = service({
				tables: [occupied("t1", "Table 1", 10)],
				runnerOrders: [ready("t1", ...types)],
			})
			expect(list.busy[0].badge).toEqual({
				text: "Ready at the pass",
				tone: "ready",
			})
		}
	})

	it("ignores the pass's orders of a table that is not on the floor, and of no table", () => {
		const list = service({
			tables: [occupied("t1", "Table 1", 10)],
			runnerOrders: [
				ready("elsewhere", "Kitchen"),
				{ name: "SINV-T", restaurant_table: null, items: [{}] },
			],
		})

		expect(list.busy[0].tier).toBe("occupied")
	})

	it("counts the lines of a QR order to accept, one or several", () => {
		const one = service({
			tables: [
				occupied("t1", "Table 1", 10, {
					qr_waiting_count: 1,
					waiting_items_count: 1,
				}),
			],
		})
		const three = service({
			tables: [
				occupied("t1", "Table 1", 10, {
					qr_waiting_count: 3,
					waiting_items_count: 3,
				}),
			],
		})

		expect(one.busy[0].badge).toEqual({
			text: "QR · 1 item to accept",
			tone: "quiet",
		})
		expect(three.busy[0].badge).toEqual({
			text: "QR · 3 items to accept",
			tone: "quiet",
		})
		// The lines the badge counts are not said twice
		expect(three.busy[0].waiting).toBe(0)
	})

	it("says the lines on hold beyond the QR order's", () => {
		const list = service({
			tables: [
				occupied("t1", "Table 1", 10, {
					qr_waiting_count: 1,
					waiting_items_count: 3,
				}),
			],
		})

		expect(list.busy[0].waiting).toBe(2)
	})

	it("gives an occupied table the plan's state word, the time since it was seated and its total", () => {
		const list = service({
			tables: [
				table("t1", "Table 1", "Occupied", {
					order_summary: seated(25, 48.5),
					waiting_items_count: 2,
				}),
			],
		})

		const [entry] = list.busy
		expect(entry.badge).toEqual({ text: "Occupied", tone: "neutral" })
		expect(entry.minutes).toBe(25)
		expect(entry.total).toBe(48.5)
		expect(entry.waiting).toBe(2)
	})

	it("gives the paid, free, cleaning and reserved tables the plan's state word", () => {
		const list = service({
			tables: [
				table("p", "P", "Paid"),
				table("e", "E"),
				table("c", "C", "Cleaning"),
				table("r", "R", "Reserved"),
			],
		})

		const words = Object.fromEntries(
			[...list.busy, ...list.others].map((entry) => [
				entry.title,
				entry.badge.text,
			]),
		)
		expect(words).toEqual({
			P: "Paid",
			E: "Empty",
			C: "Cleaning",
			R: "Reserved",
		})
	})

	it("names a table by its label alone: the till records no covers for an order", () => {
		const list = service({
			tables: [occupied("t1", "Table 2", 10, { capacity: 6 })],
		})

		expect(list.busy[0].title).toBe("Table 2")
	})
})

describe("the QR code of a table, one tap from the list", () => {
	it("is offered on the occupied and the free tables, not on the paid, cleaning or reserved ones", () => {
		const list = service({
			tables: [
				occupied("o", "O", 10),
				occupied("r", "R", 10),
				table("e", "E"),
				table("p", "P", "Paid"),
				table("c", "C", "Cleaning"),
				table("s", "S", "Reserved"),
			],
			runnerOrders: [ready("r", "Kitchen")],
		})

		const qr = Object.fromEntries(
			[...list.busy, ...list.others].map((entry) => [entry.title, entry.qr]),
		)
		expect(qr).toEqual({
			O: true,
			R: true,
			E: true,
			P: false,
			C: false,
			S: false,
		})
	})
})

describe("« Soon »: the reservations that arrive within the hour", () => {
	it("shows the reservations of the next 60 minutes, the earliest first, with their table, time and guests", () => {
		const t10 = table("t10", "Table 10")
		const list = service({
			tables: [t10],
			reservations: [
				booking("R2", "20:45", 2, [t10]),
				booking("R1", "20:15", 8, [t10]),
				booking("R3", "21:30", 4, [t10]),
			],
		})

		expect(list.soon.map((entry) => [entry.title, entry.detail])).toEqual([
			["Table 10", "reserved 20:15 · 8 guests"],
			["Table 10", "reserved 20:45 · 2 guests"],
		])
		// A reservation with a table opens it, as the plan does
		expect(list.soon[0].table).toBe(t10)
	})

	it("says « No table » when none is assigned, and one guest in the singular", () => {
		const list = service({ reservations: [booking("R1", "20:00", 1)] })

		expect(
			list.soon.map((entry) => [entry.title, entry.detail, entry.table]),
		).toEqual([["No table", "reserved 20:00 · 1 guest", null]])
	})

	it("joins the tables of a reservation that takes several", () => {
		const a = table("a", "Table 4")
		const b = table("b", "Table 5")
		const list = service({
			tables: [a, b],
			reservations: [booking("R1", "20:30", 10, [a, b])],
		})

		expect(list.soon[0].title).toBe("Table 4 + Table 5")
	})

	it("keeps a reservation that is late and not seated yet, until the server's default no-show delay", () => {
		const list = service({
			reservations: [
				booking("late", "19:30", 2),
				booking("gone", "18:50", 2),
				booking("seated", "19:50", 2, [], "Seated"),
			],
		})

		expect(list.soon.map((entry) => entry.key)).toEqual(["late"])
	})

	it("leaves out the cancelled, completed and no-show reservations, and those of another day", () => {
		const other = {
			...booking("tomorrow", "20:00", 2),
			reservation_date: "2026-11-01",
		}
		const list = service({
			reservations: [
				other,
				booking("c", "20:00", 2, [], "Cancelled"),
				booking("d", "20:00", 2, [], "Completed"),
				booking("n", "20:00", 2, [], "No Show"),
				booking("p", "20:10", 2, [], "Pending"),
			],
		})

		expect(list.soon.map((entry) => entry.key)).toEqual(["p"])
	})
})

describe("« All » and the rooms", () => {
	const tables = [
		occupied("a1", "Table 1", 10),
		occupied("a2", "Table 2", 20, {
			qr_waiting_count: 1,
			waiting_items_count: 1,
		}),
		table("a3", "Table 3"),
		occupied("b1", "T1", 30, { area: TERRACE.name }),
		table("b2", "T2", "Cleaning", { area: TERRACE.name }),
		table("b3", "T3", "Paid", { area: TERRACE.name }),
	]
	const reservations = [
		booking("inside", "20:15", 4, [tables[2]]),
		booking("outside", "20:20", 2, [{ ...tables[4] }]),
		booking("anywhere", "20:25", 2),
	]

	it("counts under « All » every table with something going on, whatever room is shown", () => {
		expect(service({ tables }).activeCount).toBe(4)
		expect(service({ tables, room: TERRACE.name }).activeCount).toBe(4)
	})

	it("offers the rooms of the plan, in its order, after « All »", () => {
		expect(service({ tables }).rooms).toEqual([
			{ name: ROOM.name, label: "Salle 1" },
			{ name: TERRACE.name, label: "Terrasse" },
		])
	})

	it("shows every table under « All »", () => {
		const list = service({ tables, reservations })

		expect(titles(list.busy)).toEqual(["Table 2", "T1", "Table 1", "T3"])
		expect(titles(list.others)).toEqual(["Table 3", "T2"])
		expect(list.soon.map((entry) => entry.key)).toEqual([
			"inside",
			"outside",
			"anywhere",
		])
	})

	it("shows a room's tables under its chip, and the reservations of its tables", () => {
		const list = service({ tables, reservations, room: TERRACE.name })

		expect(titles(list.busy)).toEqual(["T1", "T3"])
		expect(titles(list.others)).toEqual(["T2"])
		// A reservation without a table belongs to no room: « All » shows it
		expect(list.soon.map((entry) => entry.key)).toEqual(["outside"])
	})

	it("hands « Open a table » the free tables of what is shown", () => {
		expect(service({ tables }).free.map((t) => t.name)).toEqual(["a3"])
		expect(service({ tables, room: TERRACE.name }).free).toEqual([])
	})

	it("falls back to « All » when the room asked for is not on the floor any more", () => {
		const list = service({ tables, room: "gone" })

		expect(list.room).toBe(ALL_ROOMS)
		expect(list.busy).toHaveLength(4)
	})
})

describe("the server's clock", () => {
	it("reads the server's way of writing a time as the device's local time, Safari included (no space, no microseconds)", () => {
		expect(serverTime("2026-10-31 19:33:12.123456")).toEqual(
			new Date(2026, 9, 31, 19, 33, 12),
		)
		expect(serverTime("2026-10-31T19:33:12")).toEqual(
			new Date(2026, 9, 31, 19, 33, 12),
		)
		expect(serverTime(null)).toBeNull()
		expect(serverTime("not a time")).toBeNull()
	})
})

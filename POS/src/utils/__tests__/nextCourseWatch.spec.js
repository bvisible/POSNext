/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen's notice that the next course is ordered (NeoResto lot 1, Daniel, 01.11: « quand on commande la suite il doit y avoir un popup à la cuisine, et
 * //// aussi un son »). No new realtime event: the screen compares each reading of its orders with the one before. This is the rule, read without a screen: an order that was already on the screen, with dishes
 * //// sent before, whose latest send is newer than the last reading.
 */
import { describe, expect, it } from "vitest"
import { readNextCourses } from "../nextCourseWatch"

const STARTERS = "2026-11-01 12:00:00.000000"
const MAINS = "2026-11-01 12:40:00.000000"
const DESSERTS = "2026-11-01 13:30:00.000000"
const LATER = "2026-11-01 13:50:00.000000"

const dish = (status, sentAt, extra = {}) => ({
	item_code: `${status}-${sentAt}-${extra.preparation_station || ""}`,
	kds_status: status,
	kds_sent_at: sentAt,
	service_family: "",
	preparation_station: "KITCHEN",
	...extra,
})
const order = (name, items, extra = {}) => ({
	name,
	restaurant_table: `T-${name}`,
	table_display_name: `Table ${name}`,
	is_takeaway: 0,
	items,
	...extra,
})

/** Reads the screens' orders in turn, as the page does, and gives back the alerts of the last reading. */
function reads(...readings) {
	let memory = null
	let alerts = []
	for (const reading of readings) {
		;({ alerts, memory } = readNextCourses(reading.orders ?? reading, memory, reading.options))
	}
	return { alerts, memory }
}

const starterOnly = (name = "A") => order(name, [dish("Preparing", STARTERS, { service_family: "Starter" })])
const withDesserts = (name = "A", sentAt = DESSERTS) =>
	order(name, [
		dish("Delivered", STARTERS, { service_family: "Starter" }),
		dish("Delivered", MAINS, { service_family: "Main" }),
		dish("Pending", sentAt, { service_family: "Dessert", item_name: "Tarte" }),
	])

describe("the next course ordered at a table", () => {
	it("is noticed when an order already on the screen has a send newer than the last reading", () => {
		const { alerts } = reads([starterOnly()], [withDesserts()])

		expect(alerts).toHaveLength(1)
		expect(alerts[0]).toMatchObject({ order: "A", table: "Table A", families: ["Dessert"] })
		expect(alerts[0].key).toContain("A")
	})

	it("names the table as the till does: its display name, else its code", () => {
		const bare = order("B", [dish("Preparing", STARTERS, { service_family: "Starter" })], { table_display_name: "" })
		const bareNext = order(
			"B",
			[dish("Preparing", STARTERS, { service_family: "Starter" }), dish("Pending", MAINS, { service_family: "Main" })],
			{ table_display_name: "" },
		)

		expect(reads([bare], [bareNext]).alerts[0].table).toBe("T-B")
	})

	it("never alerts on the first reading, whatever the screen holds", () => {
		const { alerts, memory } = reads([withDesserts()])

		expect(alerts).toEqual([])
		expect(memory).not.toBeNull()
	})

	it("never alerts for a brand-new ticket: an order the last reading did not hold, every send of which is newer than anything the screen had seen", () => {
		// a table that sat down and ordered twice between two readings: both its sends are newer than what the screen knew
		const fresh = order("B", [
			dish("Preparing", "2026-11-01 13:00:00.000000", { service_family: "Starter" }),
			dish("Pending", "2026-11-01 13:05:00.000000", { service_family: "Main" }),
		])
		const { alerts } = reads([starterOnly("A")], [starterOnly("A"), fresh])

		expect(alerts).toEqual([])
	})

	it("is noticed for a ticket the screen did not hold because everything sent was delivered and the next course was held: it comes back with a newer send (Daniel, 01.11)", () => {
		// The server leaves an order out of the kitchen's list while none of its dishes is still to cook (all delivered, the rest held back): the order
		// reappears when the waiter orders the next course, with its earlier sends in the past and a send newer than anything the screen knew
		const other = order("X", [dish("Preparing", MAINS, { service_family: "Main" })])
		const { alerts } = reads([other], [other, withDesserts("A")])

		expect(alerts).toHaveLength(1)
		expect(alerts[0]).toMatchObject({ order: "A", table: "Table A", families: ["Dessert"] })
	})

	it("says nothing of a ticket that comes back with no send newer than what the screen had seen", () => {
		const recent = order("X", [dish("Preparing", DESSERTS, { service_family: "Dessert" })])
		const { alerts } = reads([recent], [recent, withDesserts("A", MAINS)])

		expect(alerts).toEqual([])
	})

	it("never alerts for a ticket whose first dishes are only just sent: nothing had left before", () => {
		const held = order("A", [dish("Waiting", "", { service_family: "Main" }), dish("", "", { service_family: "Starter" })])

		expect(reads([held], [starterOnly()]).alerts).toEqual([])
	})

	it("never alerts twice for the same send, however often the screen reads it", () => {
		let { memory } = reads([starterOnly()])
		const first = readNextCourses([withDesserts()], memory)
		const second = readNextCourses([withDesserts()], first.memory)
		const third = readNextCourses([withDesserts()], second.memory)

		expect(first.alerts).toHaveLength(1)
		expect(second.alerts).toEqual([])
		expect(third.alerts).toEqual([])
	})

	it("is not fooled by a stale answer that arrives after a newer one", () => {
		const { alerts } = reads([starterOnly()], [withDesserts()], [starterOnly()], [withDesserts()])

		expect(alerts).toEqual([])
	})

	it("alerts again for a later send of the same order", () => {
		const first = reads([starterOnly()], [withDesserts("A", DESSERTS)])
		const next = withDesserts("A", LATER)
		next.items.push(dish("Pending", LATER, { service_family: "Main", item_name: "Plat" }))
		const second = readNextCourses([next], first.memory)

		expect(second.alerts).toHaveLength(1)
		expect(second.alerts[0].key).not.toBe(first.alerts[0].key)
	})

	it("does not mutate the memory it was given", () => {
		const { memory } = reads([starterOnly()])
		const before = JSON.stringify([...memory.orders])

		readNextCourses([withDesserts()], memory)

		expect(JSON.stringify([...memory.orders])).toBe(before)
	})

	it("remembers what the screen saw when an order leaves it: the order that comes back with a newer send is the next course", () => {
		const { alerts } = reads([starterOnly()], [], [withDesserts()])

		expect(alerts).toHaveLength(1)
		expect(alerts[0].order).toBe("A")
	})

	it("does not alert for an order that comes back with the same send it left with", () => {
		const { alerts } = reads([withDesserts()], [], [withDesserts()])

		expect(alerts).toEqual([])
	})

	it("never alerts for a takeaway, which has no next course", () => {
		// A takeaway may carry a label (its number), so that only the takeaway flag keeps it out
		const takeaway = (items) => order("A", items, { is_takeaway: 1, restaurant_table: null, table_display_name: "Takeaway 7" })

		const { alerts } = reads(
			[takeaway([dish("Preparing", STARTERS, { service_family: "Starter" })])],
			[takeaway([dish("Preparing", STARTERS, { service_family: "Starter" }), dish("Pending", MAINS, { service_family: "Main" })])],
		)

		expect(alerts).toEqual([])
	})

	it("is noticed for an order sent before dishes carried a time (the field did not exist)", () => {
		const old = order("A", [dish("Preparing", null, { service_family: "Starter" })])

		expect(reads([old], [withDesserts()]).alerts).toHaveLength(1)
	})

	it("tells one alert per table when several tables order together", () => {
		const { alerts } = reads([starterOnly("A"), starterOnly("B")], [withDesserts("A"), withDesserts("B")])

		expect(alerts.map((alert) => alert.order).sort()).toEqual(["A", "B"])
	})

	it("reads nothing into an empty or odd answer", () => {
		expect(readNextCourses(undefined, null).alerts).toEqual([])
		expect(readNextCourses([null, {}, { name: "A" }], null).alerts).toEqual([])
		expect(readNextCourses([{ name: "A", items: null }], readNextCourses([], null).memory).alerts).toEqual([])
	})
})

describe("what the notice says of the courses", () => {
	it("lists the courses of the newest send in the order of the meal, once each", () => {
		const first = order("A", [dish("Preparing", STARTERS, { service_family: "Starter" })])
		const next = order("A", [
			dish("Preparing", STARTERS, { service_family: "Starter" }),
			dish("Pending", DESSERTS, { service_family: "Dessert" }),
			dish("Pending", DESSERTS, { service_family: "Main" }),
			dish("Pending", DESSERTS, { service_family: "Dessert" }),
		])

		expect(reads([first], [next]).alerts[0].families).toEqual(["Main", "Dessert"])
	})

	it("names only the dishes of the newest send, not the courses already served", () => {
		const alert = reads([starterOnly()], [withDesserts()]).alerts[0]

		expect(alert.families).toEqual(["Dessert"])
		expect(alert.count).toBe(1)
	})

	it("ignores a send of drinks alone where the restaurant has courses: a drink ordered late is no next course", () => {
		const next = order("A", [
			dish("Preparing", STARTERS, { service_family: "Starter" }),
			dish("Pending", DESSERTS, { service_family: "Drink" }),
		])

		expect(reads([starterOnly()], [next]).alerts).toEqual([])
	})

	it("ignores a dish of no family in a restaurant that has courses", () => {
		const next = order("A", [
			dish("Preparing", STARTERS, { service_family: "Starter" }),
			dish("Pending", DESSERTS, { service_family: "" }),
		])

		expect(reads([starterOnly()], [next]).alerts).toEqual([])
	})

	it("counts every later send, and names no course, where the restaurant has no families at all", () => {
		const first = order("A", [dish("Preparing", STARTERS)])
		const next = order("A", [dish("Preparing", STARTERS), dish("Pending", MAINS)])

		const alerts = reads([first], [next]).alerts

		expect(alerts).toHaveLength(1)
		expect(alerts[0].families).toEqual([])
	})

	it("treats an unknown family as none", () => {
		const first = order("A", [dish("Preparing", STARTERS, { service_family: "Snack" })])
		const next = order("A", [dish("Preparing", STARTERS, { service_family: "Snack" }), dish("Pending", MAINS, { service_family: "Snack" })])

		expect(reads([first], [next]).alerts[0].families).toEqual([])
	})
})

describe("the stations this screen shows", () => {
	const kitchen = (status, sentAt, family, name = "Plat") =>
		dish(status, sentAt, { service_family: family, preparation_station: "KITCHEN", item_name: name })
	const bar = (status, sentAt, family, name = "Verre") =>
		dish(status, sentAt, { service_family: family, preparation_station: "BAR", item_name: name })

	const before = order("A", [kitchen("Preparing", STARTERS, "Starter"), bar("Delivered", STARTERS, "Drink")])
	const next = order("A", [
		kitchen("Preparing", STARTERS, "Starter"),
		bar("Delivered", STARTERS, "Drink"),
		kitchen("Pending", DESSERTS, "Dessert"),
		bar("Pending", DESSERTS, "Drink"),
	])

	it("keeps only the dishes of the station chosen: the kitchen is told of the dessert", () => {
		const { alerts } = reads({ orders: [before], options: { station: "KITCHEN" } }, { orders: [next], options: { station: "KITCHEN" } })

		expect(alerts).toHaveLength(1)
		expect(alerts[0].families).toEqual(["Dessert"])
		expect(alerts[0].count).toBe(1)
	})

	it("says nothing to a station that was sent nothing: the bar is not told of a dessert", () => {
		const onlyKitchenSend = order("A", [
			kitchen("Preparing", STARTERS, "Starter"),
			bar("Delivered", STARTERS, "Drink"),
			kitchen("Pending", DESSERTS, "Dessert"),
		])

		const { alerts } = reads(
			{ orders: [before], options: { station: "BAR" } },
			{ orders: [onlyKitchenSend], options: { station: "BAR" } },
		)

		expect(alerts).toEqual([])
	})

	it("looks at every station when none is chosen", () => {
		const { alerts } = reads([before], [next])

		expect(alerts).toHaveLength(1)
		expect(alerts[0].count).toBe(2)
	})
})

//// Neoffice — where the kitchen prepares ahead (NeoResto lot 1, the service rhythm, Daniel, 01.11): the next course does not arrive, it is CALLED, and the notice goes off on the call
describe("the call of a course sent ahead", () => {
	const CALL = "2026-11-01 12:50:00.000000"
	const aheadDish = (family, status, calledAt = null, extra = {}) =>
		dish(status, STARTERS, { service_family: family, kds_ahead: 1, kds_called_at: calledAt, ...extra })
	const meal = (mainsCalledAt = null, dessertsCalledAt = null) =>
		order("A", [
			dish("Preparing", STARTERS, { service_family: "Starter" }),
			aheadDish("Main", "Pending", mainsCalledAt, { item_name: "Entrecôte" }),
			aheadDish("Dessert", "Pending", dessertsCalledAt, { item_name: "Tarte" }),
		])

	it("is noticed when the room calls the course, naming the course that was called", () => {
		const { alerts } = reads([meal()], [meal(CALL)])

		expect(alerts).toHaveLength(1)
		expect(alerts[0]).toMatchObject({ order: "A", table: "Table A", families: ["Main"], count: 1 })
		expect(alerts[0].sentAt).toBe(new Date(2026, 10, 1, 12, 50, 0).getTime())
	})

	it("is not noticed when the course arrives ahead: a line not called counts for nothing", () => {
		const first = order("A", [dish("Preparing", STARTERS, { service_family: "Starter" })])
		const withAhead = order("A", [
			dish("Preparing", STARTERS, { service_family: "Starter" }),
			aheadDish("Main", "Pending", null, { kds_sent_at: "2026-11-01 12:30:00.000000" }),
		])

		expect(reads([first], [withAhead]).alerts).toEqual([])
	})

	it("is not noticed when the kitchen starts or finishes a course that is not called", () => {
		const finished = order("A", [
			dish("Preparing", STARTERS, { service_family: "Starter" }),
			aheadDish("Main", "Ready"),
			aheadDish("Dessert", "Preparing"),
		])

		expect(reads([meal()], [finished]).alerts).toEqual([])
	})

	it("names the families called together when the whole table is called at once", () => {
		const { alerts } = reads([meal()], [meal(CALL, CALL)])

		expect(alerts).toHaveLength(1)
		expect(alerts[0].families).toEqual(["Main", "Dessert"])
		expect(alerts[0].count).toBe(2)
	})

	it("is noticed once for the same call, and again for the next course", () => {
		const { alerts: first, memory } = readNextCourses([meal()], null)
		expect(first).toEqual([])

		const second = readNextCourses([meal(CALL)], memory)
		expect(second.alerts).toHaveLength(1)

		const again = readNextCourses([meal(CALL)], second.memory)
		expect(again.alerts).toEqual([])

		const dessertsCalled = readNextCourses([meal(CALL, "2026-11-01 13:30:00.000000")], again.memory)
		expect(dessertsCalled.alerts).toHaveLength(1)
		expect(dessertsCalled.alerts[0].families).toEqual(["Dessert"])
	})

	it("is noticed on a course the kitchen finished ahead, as soon as it is called", () => {
		const done = (calledAt) =>
			order("A", [
				dish("Delivered", STARTERS, { service_family: "Starter" }),
				aheadDish("Main", "Ready", calledAt),
			])

		const { alerts } = reads([done(null)], [done(CALL)])

		expect(alerts).toHaveLength(1)
		expect(alerts[0].families).toEqual(["Main"])
	})
})

/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen's last action follows the station's runner setting (NeoRestau
 * //// lot 1, task 38a-1, ruling 112). A station with a runner (the default): the cook stops at "Ready", the dish LEAVES the
 * //// kitchen screen and waits for the runner, who delivers it; the kitchen keeps the information in a count of what waits at the
 * //// pass. A station with none (a small bistro where the cook walks the plate to the table): the cook delivers, and "Ready" and
 * //// "Delivered" are one gesture. These are the rules, read without a screen.
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { splitIntoBands } from "../kitchenBands"
import {
	carriedByRunner,
	countDishes,
	countDishesByStation,
	countDishesOfRoom,
	isCookedInPart,
	kitchenView,
	orderedQty,
	orderUsesRunner,
	readyForTheRunner,
	stationUsesRunner,
	unitsAtThePass,
	unitsLeftToCookOfItem,
	unitsToCook,
} from "../kitchenRunner"

const KITCHEN = { name: "kit", station_name: "Kitchen", use_runner: 1 }
const BAR = { name: "bar", station_name: "Bar", use_runner: 0 }
const STATIONS = [KITCHEN, BAR]

const dish = (status, station = "kit", extra = {}) => ({
	item_code: `I-${status}-${station}`,
	item_name: `${status} dish`,
	qty: 1,
	kds_status: status,
	preparation_station: station,
	...extra,
})
const order = (name, items, extra = {}) => ({
	name,
	kds_status: "Preparing",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	items,
	...extra,
})

describe("a station", () => {
	it("uses a runner unless it says it does not: the setting defaults to yes, and a station that does not say keeps the default", () => {
		expect(stationUsesRunner(KITCHEN)).toBe(true)
		expect(stationUsesRunner({ name: "x" })).toBe(true)
		expect(stationUsesRunner(undefined)).toBe(true)
		expect(stationUsesRunner(BAR)).toBe(false)
		// The server may send the flag as a number, a string or a boolean
		expect(stationUsesRunner({ use_runner: "0" })).toBe(false)
		expect(stationUsesRunner({ use_runner: false })).toBe(false)
		expect(stationUsesRunner({ use_runner: "1" })).toBe(true)
	})
})

describe("a dish carried by the runner", () => {
	it("is a Ready dish of a station that uses a runner", () => {
		expect(carriedByRunner(dish("Ready", "kit"), STATIONS, true)).toBe(true)
		expect(carriedByRunner(dish("Ready", "bar"), STATIONS, true)).toBe(false)
	})

	it("is never a dish that is not Ready: what is still to cook stays with the kitchen, what is delivered is done", () => {
		for (const status of ["Pending", "Preparing", "Delivered", "Waiting"])
			expect(carriedByRunner(dish(status), STATIONS, true), status).toBe(false)
	})

	it("is nothing when the restaurant has no runner at all: the kitchen delivers whatever its station says", () => {
		expect(carriedByRunner(dish("Ready", "kit"), STATIONS, false)).toBe(false)
	})

	it("is a dish of no station known to the screen too: the default is a runner", () => {
		expect(carriedByRunner(dish("Ready", "gone"), STATIONS, true)).toBe(true)
		expect(carriedByRunner(dish("Ready", ""), STATIONS, true)).toBe(true)
	})
})

describe("an order that goes through a runner", () => {
	it("is one with a live dish at a station that uses one: the main button then stops at Ready", () => {
		expect(
			orderUsesRunner(order("A", [dish("Preparing", "kit")]), STATIONS, true),
		).toBe(true)
		expect(
			orderUsesRunner(
				order("A", [dish("Preparing", "kit"), dish("Preparing", "bar")]),
				STATIONS,
				true,
			),
		).toBe(true)
	})

	it("is not one whose live dishes are all at stations with none: the cook delivers, in one gesture", () => {
		expect(
			orderUsesRunner(order("B", [dish("Preparing", "bar")]), STATIONS, true),
		).toBe(false)
		// A delivered dish of the kitchen's does not make the bar's ticket a runner's
		expect(
			orderUsesRunner(
				order("B", [dish("Delivered", "kit"), dish("Pending", "bar")]),
				STATIONS,
				true,
			),
		).toBe(false)
	})

	it("is not one at all when the restaurant has no runner", () => {
		expect(
			orderUsesRunner(order("A", [dish("Preparing", "kit")]), STATIONS, false),
		).toBe(false)
	})

	it("is one by default when nothing says otherwise (no dish, no stations)", () => {
		expect(orderUsesRunner(order("A", []), [], true)).toBe(true)
		expect(
			orderUsesRunner(order("A", [dish("Pending", "kit")]), [], true),
		).toBe(true)
	})
})

describe("the kitchen screen's view of the orders", () => {
	it("keeps the Ready dishes of a runner station on the ticket, struck through like the delivered ones: the cook still sees what was sent", () => {
		const source = order("A", [
			dish("Ready", "kit"),
			dish("Preparing", "kit", { item_code: "S" }),
		])
		const view = kitchenView([source], { stations: STATIONS, runnerEnabled: true })

		expect(view).toHaveLength(1)
		// The dish that left for the runner is drawn as finished business (a delivered dish is struck through and inert),
		// marked as being at the pass; the one still to cook is the cook's
		expect(view[0].items.map((line) => line.kds_status)).toEqual(["Delivered", "Preparing"])
		expect(view[0].items.map((line) => Boolean(line.at_the_pass))).toEqual([true, false])
		// What the server says is left alone: the ready dish is still Ready, and the one still to cook is the same object
		expect(source.items[0].kds_status).toBe("Ready")
		expect(view[0].items[1]).toBe(source.items[1])
	})

	it("puts a ticket in the band its dishes give it once the dishes at the pass are shown struck through: a course delivered makes the meal in progress", () => {
		// Starters at the pass, mains only sent: the dishes are still to start (Pending), and the meal is in progress, so the ticket sits in preparation (Daniel, 01.11)
		const view = kitchenView(
			[order("A", [dish("Ready", "kit"), dish("Pending", "kit", { item_code: "M" })])],
			{ stations: STATIONS, runnerEnabled: true },
		)

		expect(splitIntoBands(view).production.map((one) => one.name)).toEqual(["A"])
		expect(splitIntoBands(view).waiting).toEqual([])
	})

	it("does not copy an order it takes nothing from: the ticket on screen is the order itself", () => {
		const untouched = order("A", [dish("Preparing", "kit")])
		const view = kitchenView([untouched], {
			stations: STATIONS,
			runnerEnabled: true,
		})

		expect(view[0]).toBe(untouched)
	})

	it("keeps the delivered dishes of a ticket that has live ones: they are struck through for the whole meal", () => {
		const view = kitchenView(
			[
				order("A", [
					dish("Delivered", "kit", { item_code: "D" }),
					dish("Ready", "kit", { item_code: "R" }),
					dish("Preparing", "kit", { item_code: "P" }),
				]),
			],
			{ stations: STATIONS, runnerEnabled: true },
		)

		expect(view[0].items.map((line) => line.kds_status)).toEqual([
			"Delivered",
			"Delivered",
			"Preparing",
		])
	})

	it("keeps a ticket whose dishes are all at the pass or delivered, every dish struck through, until the runner delivers them (Daniel, 01.11: it must not disappear)", () => {
		const view = kitchenView(
			[
				order("ALL-READY", [
					dish("Ready", "kit"),
					dish("Ready", "kit", { item_code: "B" }),
				]),
				order("MIXED", [
					dish("Ready", "kit"),
					dish("Delivered", "kit", { item_code: "C" }),
				]),
			],
			{ stations: STATIONS, runnerEnabled: true },
		)

		expect(view.map((o) => o.name)).toEqual(["ALL-READY", "MIXED"])
		for (const ticket of view) {
			expect(ticket.items.every((line) => line.kds_status === "Delivered")).toBe(
				true,
			)
			expect(ticket.view_state).toBe("at-the-pass")
		}
		// the dishes themselves keep saying Ready: the copies are what the ticket draws
		expect(view[0].items.every((line) => line.at_the_pass)).toBe(true)
	})

	it("puts such a ticket in the band of tickets in preparation, with the look of a ticket that is ready", () => {
		const view = kitchenView(
			[order("ALL-READY", [dish("Ready", "kit")])],
			{ stations: STATIONS, runnerEnabled: true },
		)

		expect(splitIntoBands(view).production.map((o) => o.name)).toEqual([
			"ALL-READY",
		])
		expect(splitIntoBands(view).waiting).toEqual([])
	})

	it("keeps a ticket whose starters are done and whose mains are held back: the starters struck, the mains to come (Daniel, 01.11)", () => {
		const held = order("HELD", [
			dish("Delivered", "kit", { item_code: "S" }),
			dish("Waiting", "kit", { item_code: "M" }),
		])
		const view = kitchenView([held], { stations: STATIONS, runnerEnabled: true })

		expect(view.map((o) => o.name)).toEqual(["HELD"])
		expect(view[0].view_state).toBe("next-course")
		expect(view[0].items.map((line) => line.kds_status)).toEqual([
			"Delivered",
			"Waiting",
		])
		expect(splitIntoBands(view).production.map((o) => o.name)).toEqual(["HELD"])
	})

	it("keeps a ticket whose starters are at the pass while its mains are held back", () => {
		const held = order("HELD", [
			dish("Ready", "kit", { item_code: "S" }),
			dish("Waiting", "kit", { item_code: "M" }),
		])
		const view = kitchenView([held], { stations: STATIONS, runnerEnabled: true })

		expect(view.map((o) => o.name)).toEqual(["HELD"])
		expect(view[0].items.map((line) => line.kds_status)).toEqual([
			"Delivered",
			"Waiting",
		])
		expect(view[0].view_state).toBe("at-the-pass")
	})

	it("gives no view state to a ticket that still has a dish to cook", () => {
		const view = kitchenView(
			[
				order("LIVE", [
					dish("Ready", "kit", { item_code: "S" }),
					dish("Pending", "kit", { item_code: "M" }),
				]),
			],
			{ stations: STATIONS, runnerEnabled: true },
		)

		expect(view[0].view_state).toBeUndefined()
	})

	it("leaves the Ready dishes of a station with no runner where they are: the cook delivers them", () => {
		const bar = order("B", [dish("Ready", "bar")])
		const view = kitchenView([bar], { stations: STATIONS, runnerEnabled: true })

		expect(view).toEqual([bar])
	})

	it("leaves everything where it is when the restaurant has no runner", () => {
		const all = order("A", [dish("Ready", "kit")])
		const view = kitchenView([all], {
			stations: STATIONS,
			runnerEnabled: false,
		})

		expect(view).toEqual([all])
	})

	it("keeps a fully delivered order, which the screen shows or hides itself (« show completed »)", () => {
		const done = order("D", [dish("Delivered", "kit")], {
			kds_status: "Delivered",
		})
		const view = kitchenView([done], {
			stations: STATIONS,
			runnerEnabled: true,
		})

		expect(view).toEqual([done])
	})
})

describe("what waits at the pass", () => {
	it("is the Ready dishes of the stations that use a runner, with the order each belongs to", () => {
		const ready = readyForTheRunner(
			[
				order("A", [
					dish("Ready", "kit"),
					dish("Preparing", "kit", { item_code: "S" }),
				]),
				order("B", [dish("Ready", "bar")]),
				order("C", [dish("Pending", "kit", { item_code: "T" })]),
				order("D", [dish("Ready", "kit", { item_code: "U" })]),
			],
			{ stations: STATIONS, runnerEnabled: true },
		)

		expect(ready.map((o) => o.name)).toEqual(["A", "D"])
		expect(ready[0].items.map((line) => line.kds_status)).toEqual(["Ready"])
	})

	it("is empty when the restaurant has no runner", () => {
		expect(
			readyForTheRunner([order("A", [dish("Ready", "kit")])], {
				stations: STATIONS,
				runnerEnabled: false,
			}),
		).toEqual([])
	})

	it("comes oldest first, like the bands", () => {
		const ready = readyForTheRunner(
			[
				order("LATE", [dish("Ready", "kit")], {
					modified: "2026-10-30 12:30:00",
				}),
				order("EARLY", [dish("Ready", "kit", { item_code: "B" })], {
					modified: "2026-10-30 12:10:00",
				}),
			],
			{ stations: STATIONS, runnerEnabled: true },
		)

		expect(ready.map((o) => o.name)).toEqual(["EARLY", "LATE"])
	})

	it("is counted in dishes, by quantity: two plates on one line are two plates to carry", () => {
		const ready = readyForTheRunner(
			[
				order("A", [
					dish("Ready", "kit", { qty: 2 }),
					dish("Ready", "kit", { item_code: "B", qty: 3 }),
				]),
				order("B", [dish("Ready", "kit", { item_code: "C" })]),
			],
			{ stations: STATIONS, runnerEnabled: true },
		)

		expect(countDishes(ready)).toBe(6)
		expect(countDishes([])).toBe(0)
	})
})

describe("what the pass chips count", () => {
	// Two rooms: Hall holds 2 + 3 plates of the kitchen and 2 drinks of the bar, Patio 4 plates of the kitchen
	const ORDERS = [
		order("A", [dish("Ready", "kit", { qty: 2 }), dish("Ready", "bar", { item_code: "D", qty: 2 })], { area: "Hall" }),
		order("B", [dish("Ready", "kit", { item_code: "B", qty: 3 })], { area: "Hall" }),
		order("C", [dish("Ready", "kit", { item_code: "C", qty: 4 })], { area: "Patio" }),
	]

	it("counts a room's dishes by quantity, as the page's own count does, not by line", () => {
		expect(countDishesOfRoom(ORDERS, "Hall")).toBe(7)
		expect(countDishesOfRoom(ORDERS, "Patio")).toBe(4)
		expect(countDishesOfRoom(ORDERS, "Nowhere")).toBe(0)
	})

	it("counts a station's dishes by quantity, whatever the room", () => {
		expect(countDishesByStation(ORDERS)).toEqual({ kit: 9, bar: 2 })
	})

	it("leaves out a dish that says no station, and a line with no quantity counts for nothing", () => {
		const loose = [order("X", [dish("Ready", null, { qty: 2 }), dish("Ready", "kit", { item_code: "Y", qty: undefined })])]
		expect(countDishesByStation(loose)).toEqual({ kit: 0 })
		expect(countDishesByStation([])).toEqual({})
	})
})


// A line of six dishes marked ready for four (kitchen test of 01.11): the counters, and what the screens make of them
const six = (status, ready, delivered, extra = {}) =>
	dish(status, "kit", {
		item_code: "SIX",
		qty: 6,
		kds_ready_qty: ready,
		kds_delivered_qty: delivered,
		...extra,
	})

describe("the units of a line at the pass, against the table the server's rule shares", () => {
	// The runner is told to carry the units at the pass (`_units_at_the_pass`, pos_next/api/restaurant.py), and the kitchen's screen counts
	// the same units as sent: both are tested against the one table of examples, so that the two cannot disagree
	const { cases } = JSON.parse(
		readFileSync(
			new URL("../../../../pos_next/tests/kitchen_pass_cases.json", import.meta.url),
			"utf8",
		),
	)

	it("gives each example of the table its units", () => {
		expect(cases.length).toBeGreaterThanOrEqual(20)
		for (const example of cases) {
			expect(
				unitsAtThePass({
					kds_status: example.status,
					qty: example.qty,
					kds_ready_qty: example.ready_qty,
					kds_delivered_qty: example.delivered_qty,
				}),
				JSON.stringify(example),
			).toBeCloseTo(example.at_the_pass, 6)
		}
	})

	it("reads the line's own quantity, not the one a view shows: a view lowers `qty` and keeps the ordered one", () => {
		expect(unitsAtThePass({ ...six("Ready", 6, 4), qty: 2, ordered_qty: 6 })).toBe(2)
		expect(orderedQty({ qty: 2, ordered_qty: 6 })).toBe(6)
		expect(orderedQty({ qty: 2 })).toBe(2)
		expect(orderedQty(undefined)).toBe(0)
	})
})

describe("the units of a line left to cook", () => {
	it("are what was not cooked, for a line at the stove", () => {
		expect(unitsToCook(six("Preparing", 4, 0))).toBe(2)
		expect(unitsToCook(six("Pending", 0, 0))).toBe(6)
		expect(unitsToCook(six("Preparing", 9, 0))).toBe(0)
	})

	it("are none for a line that is ready, delivered or held back", () => {
		for (const status of ["Ready", "Delivered", "Waiting"])
			expect(unitsToCook(six(status, 0, 0)), status).toBe(0)
	})

	it("count the lines of one item together: the server fills them in the order of the order's lines", () => {
		const lines = [
			dish("Preparing", "kit", { item_code: "X", qty: 3, kds_ready_qty: 1 }),
			dish("Preparing", "kit", { item_code: "X", qty: 2, kds_ready_qty: 0 }),
			dish("Preparing", "kit", { item_code: "Y", qty: 9 }),
			dish("Ready", "kit", { item_code: "X", qty: 4 }),
		]
		expect(unitsLeftToCookOfItem(lines, "X")).toBe(4)
		expect(unitsLeftToCookOfItem(lines, "Z")).toBe(0)
	})

	it("say when a line is cooked in part: some units cooked, not all", () => {
		expect(isCookedInPart(six("Preparing", 4, 0))).toBe(true)
		expect(isCookedInPart(six("Pending", 1, 0))).toBe(true)
		expect(isCookedInPart(six("Preparing", 0, 0))).toBe(false)
		expect(isCookedInPart(six("Preparing", 6, 0))).toBe(false)
		expect(isCookedInPart(six("Ready", 6, 0))).toBe(false)
		expect(isCookedInPart(six("Delivered", 6, 6))).toBe(false)
	})
})

describe("the kitchen screen's view of a line cooked in part", () => {
	it("keeps the line on the ticket with the units still to cook as its quantity, and the line's own quantity beside it", () => {
		const source = order("A", [six("Preparing", 4, 0)])
		const view = kitchenView([source], { stations: STATIONS, runnerEnabled: true })

		expect(view).toHaveLength(1)
		const [line] = view[0].items
		expect(line.kds_status).toBe("Preparing")
		expect(line.qty).toBe(2)
		expect(line.ordered_qty).toBe(6)
		expect(line.at_the_pass).toBeUndefined()
		// The counters stay, so that the card can say « 4 of 6 sent » and put the line back exactly
		expect([line.kds_ready_qty, line.kds_delivered_qty]).toEqual([4, 0])
		// What the server says is left alone
		expect(source.items[0].qty).toBe(6)
	})

	it("is a copy only for the line that is cooked in part: the others are the same objects", () => {
		const source = order("A", [
			six("Preparing", 4, 0),
			dish("Preparing", "kit", { item_code: "OTHER" }),
		])
		const view = kitchenView([source], { stations: STATIONS, runnerEnabled: true })

		expect(view[0].items[0]).not.toBe(source.items[0])
		expect(view[0].items[1]).toBe(source.items[1])
	})

	it("keeps the ticket in the band its dishes still to cook give it: a line cooked in part is a live dish", () => {
		const view = kitchenView([order("A", [six("Preparing", 4, 0)])], {
			stations: STATIONS,
			runnerEnabled: true,
		})

		expect(splitIntoBands(view).production.map((one) => one.name)).toEqual(["A"])
	})

	it("leaves a line not begun, or cooked in full, as it is", () => {
		const untouched = order("A", [six("Preparing", 0, 0)])
		expect(kitchenView([untouched], { stations: STATIONS, runnerEnabled: true })[0]).toBe(untouched)
	})

	it("shows a line cooked in part at a station with no runner the same way: what already left is told", () => {
		const view = kitchenView([order("B", [dish("Preparing", "bar", { qty: 6, kds_ready_qty: 4 })])], {
			stations: STATIONS,
			runnerEnabled: true,
		})

		expect(view[0].items[0].qty).toBe(2)
		expect(view[0].items[0].ordered_qty).toBe(6)
	})
})

describe("what waits at the pass, with lines cooked in part", () => {
	it("holds the units cooked of a line cooked in part, as a Ready line of that quantity", () => {
		const ready = readyForTheRunner([order("A", [six("Preparing", 4, 0)])], {
			stations: STATIONS,
			runnerEnabled: true,
		})

		expect(ready.map((one) => one.name)).toEqual(["A"])
		const [line] = ready[0].items
		expect(line.kds_status).toBe("Ready")
		expect(line.qty).toBe(4)
		expect(line.ordered_qty).toBe(6)
		expect(line.at_the_pass).toBe(true)
		expect(countDishes(ready)).toBe(4)
	})

	it("holds the rest of a Ready line when some units were delivered", () => {
		const ready = readyForTheRunner([order("A", [six("Ready", 6, 4)])], {
			stations: STATIONS,
			runnerEnabled: true,
		})

		expect(ready[0].items[0].qty).toBe(2)
		expect(ready[0].items[0].ordered_qty).toBe(6)
	})

	it("holds a whole Ready line as the very same object, as it always did (a recall is optimistic on it)", () => {
		const source = order("A", [six("Ready", 0, 0)])
		const ready = readyForTheRunner([source], { stations: STATIONS, runnerEnabled: true })

		expect(ready[0].items[0]).toBe(source.items[0])
	})

	it("holds nothing of a line cooked in part whose units were all delivered", () => {
		expect(
			readyForTheRunner([order("A", [six("Preparing", 4, 4)])], {
				stations: STATIONS,
				runnerEnabled: true,
			}),
		).toEqual([])
	})

	it("holds nothing of a station with no runner, cooked in part or not", () => {
		expect(
			readyForTheRunner([order("B", [dish("Preparing", "bar", { qty: 6, kds_ready_qty: 4 })])], {
				stations: STATIONS,
				runnerEnabled: true,
			}),
		).toEqual([])
	})

	it("leaves the ticket of the kitchen holding the units still to cook while the pass holds the cooked ones", () => {
		const source = order("A", [six("Preparing", 4, 0)])
		const context = { stations: STATIONS, runnerEnabled: true }

		expect(countDishes(kitchenView([source], context))).toBe(2)
		expect(countDishes(readyForTheRunner([source], context))).toBe(4)
	})
})

//// Neoffice — where the kitchen prepares ahead (NeoRestau lot 1, the service rhythm, Daniel, 01.11): « Prêt d'avance » is a state of its own on the ticket, not the pass, and the runner is offered a dish only once it is called
describe("a dish finished ahead of its course", () => {
	const CALL = "2026-10-30 12:30:00.000000"
	const SENT = "2026-10-30 12:00:00.000000"
	const finished = (extra = {}) => dish("Ready", "kit", { item_code: "MAIN", kds_ahead: 1, kds_sent_at: SENT, ...extra })

	it("is not carried by the runner until its course is called, whatever its station", () => {
		expect(carriedByRunner(finished(), STATIONS, true)).toBe(false)
		expect(carriedByRunner(finished({ kds_called_at: CALL }), STATIONS, true)).toBe(true)
		expect(carriedByRunner(finished({ item_code: "OTHER", preparation_station: "bar" }), STATIONS, true)).toBe(false)
	})

	it("stays on the kitchen ticket as it is, not struck through as a dish at the pass", () => {
		const source = order("A", [dish("Preparing", "kit", { item_code: "S" }), finished()])

		const view = kitchenView([source], { stations: STATIONS, runnerEnabled: true })

		expect(view).toHaveLength(1)
		expect(view[0].items.map((line) => line.kds_status)).toEqual(["Preparing", "Ready"])
		expect(view[0].items.some((line) => line.at_the_pass)).toBe(false)
		expect(view[0]).toBe(source)
	})

	it("goes to the pass, struck through on the ticket, once its course is called", () => {
		const source = order("A", [dish("Preparing", "kit", { item_code: "S" }), finished({ kds_called_at: CALL })])

		const view = kitchenView([source], { stations: STATIONS, runnerEnabled: true })

		expect(view[0].items.map((line) => line.kds_status)).toEqual(["Preparing", "Delivered"])
		expect(view[0].items[1].at_the_pass).toBe(true)
	})

	it("keeps a ticket whose only dish left is finished ahead as it is: nothing is at the pass, so it has no view state", () => {
		const view = kitchenView([order("A", [dish("Delivered", "kit", { item_code: "D" }), finished()])], {
			stations: STATIONS,
			runnerEnabled: true,
		})

		expect(view[0].view_state).toBeUndefined()
	})

	it("is not offered to the runner until it is called", () => {
		const waiting = order("A", [finished(), dish("Ready", "kit", { item_code: "R" })])
		const called = order("B", [finished({ kds_called_at: CALL })])

		const ready = readyForTheRunner([waiting, called], { stations: STATIONS, runnerEnabled: true })

		expect(ready.map((o) => o.name)).toEqual(["A", "B"])
		expect(ready[0].items.map((line) => line.item_code)).toEqual(["R"])
		expect(ready[1].items.map((line) => line.item_code)).toEqual(["MAIN"])
	})

	it("leaves a ticket with nothing but dishes finished ahead out of what waits at the pass", () => {
		expect(readyForTheRunner([order("A", [finished()])], { stations: STATIONS, runnerEnabled: true })).toEqual([])
	})

	it("is not 'cooked in part' while its course is not called: it is shown whole, with nothing sent", () => {
		const partly = dish("Preparing", "kit", { item_code: "P", qty: 6, kds_ready_qty: 4, kds_ahead: 1 })

		expect(isCookedInPart(partly)).toBe(false)
		expect(isCookedInPart({ ...partly, kds_called_at: CALL })).toBe(true)
		expect(kitchenView([order("A", [partly])], { stations: STATIONS })[0].items[0].qty).toBe(6)
	})

	it("is waited for by a ticket that is both live and called: a dish called and finished is carried, one not called stays", () => {
		const items = [finished({ item_code: "A", kds_called_at: CALL }), finished({ item_code: "B" })]

		const view = kitchenView([order("A", items)], { stations: STATIONS, runnerEnabled: true })

		expect(view[0].items.map((line) => line.kds_status)).toEqual(["Delivered", "Ready"])
	})

	it("leaves the lines of the table of examples at the pass as the shared table says (no line there was sent ahead)", () => {
		expect(unitsAtThePass(finished())).toBe(1)
	})
})

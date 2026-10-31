/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen's last action follows the station's runner setting (NeoRestau
 * //// lot 1, task 38a-1, ruling 112). A station with a runner (the default): the cook stops at "Ready", the dish LEAVES the
 * //// kitchen screen and waits for the runner, who delivers it; the kitchen keeps the information in a count of what waits at the
 * //// pass. A station with none (a small bistro where the cook walks the plate to the table): the cook delivers, and "Ready" and
 * //// "Delivered" are one gesture. These are the rules, read without a screen.
 */
import { describe, expect, it } from "vitest"
import {
	carriedByRunner,
	countDishes,
	kitchenView,
	orderUsesRunner,
	readyForTheRunner,
	stationUsesRunner,
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
	it("takes the Ready dishes of a runner station off the ticket: the dishes left are the cook's", () => {
		const view = kitchenView(
			[
				order("A", [
					dish("Ready", "kit"),
					dish("Preparing", "kit", { item_code: "S" }),
				]),
			],
			{ stations: STATIONS, runnerEnabled: true },
		)

		expect(view).toHaveLength(1)
		expect(view[0].items.map((line) => line.kds_status)).toEqual(["Preparing"])
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
			"Preparing",
		])
	})

	it("drops a ticket that has nothing left for the kitchen: its dishes are at the pass, or delivered", () => {
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

		expect(view).toEqual([])
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

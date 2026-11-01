/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen screen splits its tickets into the ones waiting and
 * //// the ones in preparation, each in order of arrival (NeoRestau lot 1, task 23). The split and the order live in a
 * //// helper of their own so that they are read, and tested, apart from the screen that draws them.
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
	BAND_PRODUCTION,
	BAND_WAITING,
	arrivalOf,
	bandOf,
	byArrival,
	kitchenStatusOf,
	pinFlashing,
	splitIntoBands,
} from "../kitchenBands"

let counter = 0
/** An order as `get_kds_orders` returns it: its lines carry a `kds_status` each, its times are Frappe datetimes. */
function order(lines, extra = {}) {
	counter += 1
	const name = extra.name || `SINV-${counter}`
	return {
		name,
		kds_status: "Pending",
		creation: "2026-10-30 12:00:00.000000",
		modified: "2026-10-30 12:00:00.000000",
		items: lines.map((status, index) => ({
			name: `${name}-${index}`,
			item_name: "Dish",
			qty: 1,
			kds_status: status,
		})),
		...extra,
	}
}

describe("the status a ticket shows, from the dishes it shows (fix round 1, ruling 78)", () => {
	// `update_item_kds_status` leaves the order's own status alone until EVERY dish is ready: with several stations that is
	// the everyday state of an order whose dishes are being cooked, so the order's status says "Pending" while a dish is
	// "Preparing". The look of a ticket (its border, its badge, its main button) follows the dishes the screen shows.

	it("is Pending while no dish shown is begun, whatever the order says", () => {
		expect(kitchenStatusOf(order(["Pending", "Pending"]))).toBe("Pending")
		expect(
			kitchenStatusOf(
				order(["Pending", "Pending"], { kds_status: "Preparing" }),
			),
		).toBe("Pending")
		expect(kitchenStatusOf(order(["Waiting", "Pending"]))).toBe("Pending")
	})

	it("is Preparing as soon as a dish is begun, the order's own status still Pending: the data as the server leaves it", () => {
		const real = order(["Preparing", "Pending"], { kds_status: "Pending" })
		expect(kitchenStatusOf(real)).toBe("Preparing")
		expect(kitchenStatusOf(order(["Ready", "Pending"]))).toBe("Preparing")
		expect(kitchenStatusOf(order(["Ready", "Preparing"]))).toBe("Preparing")
	})

	it("is Ready when every dish shown is ready, the order's own status still Preparing", () => {
		expect(
			kitchenStatusOf(order(["Ready", "Ready"], { kds_status: "Preparing" })),
		).toBe("Ready")
		// A dish held back is not on the ticket to cook: it does not keep the others from being ready
		expect(kitchenStatusOf(order(["Ready", "Waiting"]))).toBe("Ready")
	})

	it("ignores a delivered dish, as the band does: a second round is Pending, a ready one among delivered is Ready", () => {
		expect(kitchenStatusOf(order(["Delivered", "Pending"]))).toBe("Pending")
		expect(kitchenStatusOf(order(["Delivered", "Preparing"]))).toBe("Preparing")
		expect(kitchenStatusOf(order(["Delivered", "Ready"]))).toBe("Ready")
	})

	it("is Ready for a ticket the kitchen view says is at the pass, whatever the order says (Daniel, 01.11: it stays, struck through)", () => {
		const atThePass = order(["Delivered", "Delivered"], {
			kds_status: "Delivered",
			view_state: "at-the-pass",
		})
		expect(kitchenStatusOf(atThePass)).toBe("Ready")
		expect(bandOf(atThePass)).toBe(BAND_PRODUCTION)
	})

	it("is Preparing for a ticket the kitchen view says waits for its next course: starters done, mains held back", () => {
		const nextCourse = order(["Delivered", "Waiting"], {
			kds_status: "Delivered",
			view_state: "next-course",
		})
		expect(kitchenStatusOf(nextCourse)).toBe("Preparing")
		expect(bandOf(nextCourse)).toBe(BAND_PRODUCTION)
	})

	it("is Delivered when the order says so or every dish does", () => {
		expect(
			kitchenStatusOf(order(["Pending"], { kds_status: "Delivered" })),
		).toBe("Delivered")
		expect(kitchenStatusOf(order(["Delivered", "Delivered"]))).toBe("Delivered")
		expect(kitchenStatusOf(order(["Delivered", "Waiting"]))).toBe("Delivered")
	})

	it("is Pending for what says nothing: no dish, or dishes with no status", () => {
		expect(kitchenStatusOf(order([]))).toBe("Pending")
		expect(kitchenStatusOf(order([undefined, null, ""]))).toBe("Pending")
		expect(kitchenStatusOf({ name: "X" })).toBe("Pending")
	})

	it("is the rule of the band, whatever the dishes: waiting, in preparation or gone", () => {
		const STATUSES = [
			"Waiting",
			"Pending",
			"Preparing",
			"Ready",
			"Delivered",
			"",
		]
		const bandOfStatus = {
			Pending: BAND_WAITING,
			Preparing: BAND_PRODUCTION,
			Ready: BAND_PRODUCTION,
			Delivered: null,
		}
		let checked = 0
		for (const a of STATUSES) {
			for (const b of STATUSES) {
				for (const c of [...STATUSES, undefined]) {
					const lines = c === undefined ? [a, b] : [a, b, c]
					const ticket = order(lines)
					expect(bandOf(ticket), lines.join("/")).toBe(
						bandOfStatus[kitchenStatusOf(ticket)],
					)
					checked += 1
				}
			}
		}
		expect(checked).toBe(6 * 6 * 7)
	})
})

describe("the status a ticket shows, against the table the server's rule shares (task 38b)", () => {
	// The server writes on the order the status its dishes give it (`_order_status_of`, pos_next/api/restaurant.py), by this rule: both
	// are tested against the one table of examples, so that the status stored and the status the screen works out cannot disagree
	const { cases } = JSON.parse(
		readFileSync(
			new URL("../../../../pos_next/tests/kitchen_status_cases.json", import.meta.url),
			"utf8",
		),
	)

	it("gives each example of the table its status, the order's own status being anything but Delivered", () => {
		expect(cases.length).toBeGreaterThanOrEqual(15)
		for (const { dishes, status } of cases) {
			expect(
				kitchenStatusOf(order(dishes.map((dish) => dish ?? undefined))),
				JSON.stringify(dishes),
			).toBe(status)
		}
	})
})

describe("the band of a ticket", () => {
	it("is WAITING when no line has started: every line is sent and none is begun", () => {
		expect(bandOf(order(["Pending"]))).toBe(BAND_WAITING)
		expect(bandOf(order(["Pending", "Pending", "Pending"]))).toBe(BAND_WAITING)
	})

	it("is PRODUCTION as soon as one line is Preparing, the others still waiting", () => {
		expect(bandOf(order(["Preparing"]))).toBe(BAND_PRODUCTION)
		expect(bandOf(order(["Pending", "Preparing", "Pending"]))).toBe(
			BAND_PRODUCTION,
		)
	})

	it("is PRODUCTION when every line is Ready and the ticket is not delivered yet: it keeps its ready look in that band", () => {
		expect(bandOf(order(["Ready", "Ready"], { kds_status: "Ready" }))).toBe(
			BAND_PRODUCTION,
		)
	})

	it("is PRODUCTION when one line is Ready and another is still waiting", () => {
		expect(bandOf(order(["Ready", "Pending"]))).toBe(BAND_PRODUCTION)
	})

	it("is nowhere once the ticket is delivered: the order says so, or every one of its lines does", () => {
		expect(bandOf(order(["Delivered"], { kds_status: "Delivered" }))).toBe(null)
		expect(bandOf(order(["Delivered", "Delivered"]))).toBe(null)
		// The order says so and a line is still out: what the screen showed before this one, it keeps hiding
		expect(bandOf(order(["Pending"], { kds_status: "Delivered" }))).toBe(null)
	})

	it("is WAITING for a second round: the first one is delivered, the new dishes are only sent", () => {
		// A table's order stays open for the whole meal. The starters are delivered and struck through on the ticket, the
		// mains arrive as a new send. Nothing is being made: counting the delivered starters as "started" would put the
		// mains in production the moment they arrive.
		expect(
			bandOf(order(["Delivered", "Delivered", "Pending", "Pending"])),
		).toBe(BAND_WAITING)
	})

	it("is PRODUCTION for a later round that has been started, or is ready", () => {
		expect(bandOf(order(["Delivered", "Preparing"]))).toBe(BAND_PRODUCTION)
		expect(bandOf(order(["Delivered", "Ready"]))).toBe(BAND_PRODUCTION)
	})

	it("does not count a dish held back (Waiting) as started, nor as a reason to wait", () => {
		expect(bandOf(order(["Waiting", "Pending"]))).toBe(BAND_WAITING)
		expect(bandOf(order(["Waiting", "Preparing"]))).toBe(BAND_PRODUCTION)
		// Held-back dishes and delivered ones only: nothing for the kitchen to do, and a delivery happened
		expect(bandOf(order(["Delivered", "Waiting"]))).toBe(null)
	})

	it("keeps in WAITING what the server sent with nothing to say for itself: no line, or lines with no status", () => {
		expect(bandOf(order([]))).toBe(BAND_WAITING)
		expect(bandOf(order([undefined, null, ""]))).toBe(BAND_WAITING)
		expect(bandOf({ name: "X", creation: "2026-10-30 12:00:00" })).toBe(
			BAND_WAITING,
		)
	})
})

describe("the time of arrival of a ticket", () => {
	it("is the time it was last sent to the kitchen: `modified`, the time the ticket's own timer counts from", () => {
		const second = order(["Pending"], {
			creation: "2026-10-30 12:00:00.000000",
			modified: "2026-10-30 12:20:30.250000",
		})
		const date = new Date(arrivalOf(second))
		expect(date.getHours()).toBe(12)
		expect(date.getMinutes()).toBe(20)
		expect(date.getSeconds()).toBe(30)
		expect(date.getMilliseconds()).toBe(250)
	})

	it("falls back to `creation` when the order carries no `modified`", () => {
		const bare = order(["Pending"], {
			creation: "2026-10-30 11:05:00",
			modified: undefined,
		})
		expect(new Date(arrivalOf(bare)).getMinutes()).toBe(5)
	})

	it("reads a datetime the way every browser does: with the space Frappe writes, with or without the microseconds", () => {
		const withMicroseconds = arrivalOf({
			modified: "2026-10-30 12:00:01.123456",
		})
		const without = arrivalOf({ modified: "2026-10-30 12:00:01" })
		expect(Number.isFinite(withMicroseconds)).toBe(true)
		expect(withMicroseconds - without).toBe(123)
		// An ISO string with a T reads the same
		expect(arrivalOf({ modified: "2026-10-30T12:00:01" })).toBe(without)
	})

	it("is the time the course at the kitchen LEFT when the dishes carry it, whatever moved `modified` since (the timer counts from that time too)", () => {
		const lateChange = order(["Pending"], {
			creation: "2026-10-30 11:00:00.000000",
			// a drink added at 15:00 moved the order's last change; the dish itself left at 14:00
			modified: "2026-10-30 15:00:00.000000",
			items: [
				{ name: "L-0", item_name: "Dish", qty: 1, kds_status: "Pending", kds_sent_at: "2026-10-30 14:00:00.123456" },
			],
		})
		const date = new Date(arrivalOf(lateChange))
		expect(date.getHours()).toBe(14)
		expect(date.getMinutes()).toBe(0)
		expect(date.getMilliseconds()).toBe(123)
	})

	it("counts from the oldest send still to cook, as the timer does, and from the last send when nothing is left to cook", () => {
		const open = order(["Delivered"], {
			modified: "2026-10-30 15:00:00",
			items: [
				{ name: "O-0", qty: 1, kds_status: "Delivered", kds_sent_at: "2026-10-30 12:00:00" },
				{ name: "O-1", qty: 1, kds_status: "Preparing", kds_sent_at: "2026-10-30 12:40:00" },
				{ name: "O-2", qty: 1, kds_status: "Pending", kds_sent_at: "2026-10-30 14:55:00" },
			],
		})
		expect(new Date(arrivalOf(open)).getMinutes()).toBe(40)
		const atThePass = order(["Ready"], {
			modified: "2026-10-30 15:00:00",
			items: [
				{ name: "P-0", qty: 1, kds_status: "Delivered", kds_sent_at: "2026-10-30 12:00:00" },
				{ name: "P-1", qty: 1, kds_status: "Ready", kds_sent_at: "2026-10-30 12:40:00" },
			],
		})
		expect(new Date(arrivalOf(atThePass)).getMinutes()).toBe(40)
	})

	it("keeps the last change for a ticket whose dishes carry no time (sent before the field existed)", () => {
		const old = order(["Pending"], {
			modified: "2026-10-30 12:20:00",
			items: [{ name: "N-0", qty: 1, kds_status: "Pending", kds_sent_at: null }],
		})
		expect(new Date(arrivalOf(old)).getMinutes()).toBe(20)
	})
})

describe("splitting the tickets into the two bands", () => {
	it("puts the ticket with the biggest timer first even when a later change (a drink added) moved its last change", () => {
		const changedLater = order(["Pending"], {
			name: "OLDER-COURSE",
			modified: "2026-10-30 15:00:00",
			items: [{ name: "A-0", qty: 1, kds_status: "Pending", kds_sent_at: "2026-10-30 14:00:00" }],
		})
		const sentLater = order(["Pending"], {
			name: "NEWER-COURSE",
			modified: "2026-10-30 14:30:00",
			items: [{ name: "B-0", qty: 1, kds_status: "Pending", kds_sent_at: "2026-10-30 14:30:00" }],
		})

		const { waiting } = splitIntoBands([sentLater, changedLater])

		expect(waiting.map((o) => o.name)).toEqual(["OLDER-COURSE", "NEWER-COURSE"])
	})

	it("puts each ticket in its band, oldest first, the waiting ones apart from the ones in preparation", () => {
		const wOld = order(["Pending"], {
			name: "W-OLD",
			modified: "2026-10-30 12:00:00",
		})
		const wNew = order(["Pending"], {
			name: "W-NEW",
			modified: "2026-10-30 12:09:00",
		})
		const pOld = order(["Preparing"], {
			name: "P-OLD",
			modified: "2026-10-30 12:01:00",
		})
		const pNew = order(["Ready"], {
			name: "P-NEW",
			modified: "2026-10-30 12:08:00",
		})

		// Handed over in no order at all
		const { waiting, production } = splitIntoBands([wNew, pNew, wOld, pOld])

		expect(waiting.map((o) => o.name)).toEqual(["W-OLD", "W-NEW"])
		expect(production.map((o) => o.name)).toEqual(["P-OLD", "P-NEW"])
	})

	it("orders by the time of the last send, not by the time the table's order was opened", () => {
		// Table A opened at 12:00 and sends its mains at 12:20; table B opened at 12:10 and sent at 12:12. The mains of A
		// are the NEWEST arrival in the kitchen. By `creation` they would sit first in the queue, ahead of B's.
		const a = order(["Delivered", "Pending"], {
			name: "A",
			creation: "2026-10-30 12:00:00",
			modified: "2026-10-30 12:20:00",
		})
		const b = order(["Pending"], {
			name: "B",
			creation: "2026-10-30 12:10:00",
			modified: "2026-10-30 12:12:00",
		})

		expect(splitIntoBands([a, b]).waiting.map((o) => o.name)).toEqual([
			"B",
			"A",
		])
	})

	it("breaks a tie by the time the table's order was opened, then by name, so that the order never flickers", () => {
		const same = { modified: "2026-10-30 12:00:00" }
		const late = order(["Pending"], {
			name: "C",
			creation: "2026-10-30 11:59:00",
			...same,
		})
		const earlyB = order(["Pending"], {
			name: "B",
			creation: "2026-10-30 11:00:00",
			...same,
		})
		const earlyA = order(["Pending"], {
			name: "A",
			creation: "2026-10-30 11:00:00",
			...same,
		})

		const names = (list) => splitIntoBands(list).waiting.map((o) => o.name)
		expect(names([late, earlyB, earlyA])).toEqual(["A", "B", "C"])
		expect(names([earlyA, late, earlyB])).toEqual(["A", "B", "C"])
	})

	it("drops the delivered tickets, and brings them back AFTER the ones in preparation when asked to, apart from them", () => {
		// The delivered ones are older than the live one: by arrival they would come first. They are not part of the work
		// in hand, so they come after it, oldest first among themselves
		const done = order(["Delivered"], {
			name: "DONE",
			kds_status: "Delivered",
			modified: "2026-10-30 11:00:00",
		})
		const doneToo = order(["Delivered"], {
			name: "DONE-TOO",
			kds_status: "Delivered",
			modified: "2026-10-30 11:30:00",
		})
		const live = order(["Preparing"], {
			name: "LIVE",
			modified: "2026-10-30 12:00:00",
		})

		expect(
			splitIntoBands([doneToo, done, live]).production.map((o) => o.name),
		).toEqual(["LIVE"])
		expect(
			splitIntoBands([doneToo, done, live], {
				includeDelivered: true,
			}).production.map((o) => o.name),
		).toEqual(["LIVE", "DONE", "DONE-TOO"])
	})

	it("returns the very orders it was given, not copies: the ticket's own optimistic updates stay seen by the screen", () => {
		const one = order(["Pending"])
		const two = order(["Preparing"])
		const input = [two, one]

		const { waiting, production } = splitIntoBands(input)

		expect(waiting[0]).toBe(one)
		expect(production[0]).toBe(two)
		// And the list handed over is left as it was
		expect(input).toEqual([two, one])
		expect(input[0]).toBe(two)
	})

	it("gives two empty bands for no ticket at all", () => {
		expect(splitIntoBands([])).toEqual({ waiting: [], production: [] })
		expect(splitIntoBands(undefined)).toEqual({ waiting: [], production: [] })
	})

	it("moves a ticket from the waiting band to the production band when one of its lines starts", () => {
		const ticket = order(["Pending", "Pending"], { name: "T" })
		expect(splitIntoBands([ticket]).waiting).toHaveLength(1)

		ticket.items[0].kds_status = "Preparing"

		const after = splitIntoBands([ticket])
		expect(after.waiting).toHaveLength(0)
		expect(after.production.map((o) => o.name)).toEqual(["T"])
	})
})

//// Neoffice — where the kitchen prepares ahead (NeoRestau lot 1, the service rhythm, Daniel, 01.11): the dishes sent ahead of their course and not called are not what the ticket waits for
describe("the dishes sent ahead of their course (the service rhythm)", () => {
	const { ahead_cases: aheadCases } = JSON.parse(
		readFileSync(new URL("../../../../pos_next/tests/kitchen_status_cases.json", import.meta.url), "utf8"),
	)
	const CALLED = "2026-10-30 13:00:00.000000"
	const SENT = "2026-10-30 12:00:00.000000"

	/** An order whose dishes are `{ status, uncalled }`: an uncalled dish left ahead and was not called, a called one is a plain dish. */
	function aheadOrder(dishes, extra = {}) {
		const base = order(dishes.map((dish) => dish.status), extra)
		base.items.forEach((item, index) => {
			item.kds_sent_at = SENT
			if (dishes[index].uncalled) item.kds_ahead = 1
		})
		return base
	}

	it("gives each example of the shared table its status, as the server does", () => {
		expect(aheadCases.length).toBeGreaterThanOrEqual(10)
		for (const { about, dishes, status } of aheadCases) {
			expect(kitchenStatusOf(aheadOrder(dishes)), about).toBe(status)
		}
	})

	it("is the status of the dishes called alone while any is live: a dish finished ahead does not make the ticket ready", () => {
		const ticket = aheadOrder([
			{ status: "Preparing", uncalled: false },
			{ status: "Ready", uncalled: true },
		])

		expect(kitchenStatusOf(ticket)).toBe("Preparing")
		expect(bandOf(ticket)).toBe(BAND_PRODUCTION)
	})

	it("is Pending, in the waiting band, when the only dishes left are sent ahead and none is begun", () => {
		const ticket = aheadOrder([
			{ status: "Delivered", uncalled: false },
			{ status: "Pending", uncalled: true },
		])

		expect(kitchenStatusOf(ticket)).toBe("Pending")
		expect(bandOf(ticket)).toBe(BAND_WAITING)
	})

	it("is Preparing, never Ready, when the only dishes left are finished ahead: the ticket stays in preparation", () => {
		const ticket = aheadOrder([
			{ status: "Delivered", uncalled: false },
			{ status: "Ready", uncalled: true },
		])

		expect(kitchenStatusOf(ticket)).toBe("Preparing")
		expect(bandOf(ticket)).toBe(BAND_PRODUCTION)
	})

	it("is the ordinary status once the course is called: the dish finished ahead is ready, at the pass", () => {
		const ticket = aheadOrder([
			{ status: "Delivered", uncalled: false },
			{ status: "Ready", uncalled: true },
		])
		ticket.items[1].kds_called_at = CALLED

		expect(kitchenStatusOf(ticket)).toBe("Ready")
	})

	it("leaves a plain ticket as it was", () => {
		expect(kitchenStatusOf(order(["Ready", "Pending"]))).toBe("Preparing")
		expect(kitchenStatusOf(order(["Delivered", "Ready"]))).toBe("Ready")
	})

	it("sorts a ticket by the call of its course, the dishes still uncalled counting for nothing", () => {
		const waited = aheadOrder([
			{ status: "Delivered", uncalled: false },
			{ status: "Pending", uncalled: true },
		])
		waited.items[0].kds_sent_at = "2026-10-30 12:30:00.000000"
		const called = aheadOrder([{ status: "Pending", uncalled: true }])
		called.items[0].kds_called_at = "2026-10-30 12:45:00.000000"

		expect(arrivalOf(waited)).toBe(new Date(2026, 9, 30, 12, 30, 0).getTime())
		expect(arrivalOf(called)).toBe(new Date(2026, 9, 30, 12, 45, 0).getTime())
		expect(splitIntoBands([called, waited]).waiting.map((t) => t.name)).toEqual([waited.name, called.name])
	})

	it("orders the runner's tickets by the call too: a course sent ahead long ago and called just now comes after a course sent in between", () => {
		// The runner's list (`get_runner_orders`) holds the lines at the pass only: a line sent ahead is there once it is called
		const calledJustNow = aheadOrder([{ status: "Ready", uncalled: true }])
		calledJustNow.items[0].kds_called_at = "2026-10-30 12:45:00.000000"
		const sentInBetween = aheadOrder([{ status: "Ready", uncalled: false }])
		sentInBetween.items[0].kds_sent_at = "2026-10-30 12:30:00.000000"

		expect([calledJustNow, sentInBetween].sort(byArrival).map((t) => t.name)).toEqual([sentInBetween.name, calledJustNow.name])
	})
})

//// Neoffice — the tickets that blink stand FIRST in their band, in the order they were called (Daniel, 01.11: « il faut plutôt faire des popups qui se suivent » — the second ticket was out of sight in a long
//// column, and they are hard to find when the cook walks around): the cook finds them at the head of the band, takes them one after the other, and a ticket left « to do » goes back to its place of arrival
describe("the tickets that blink, first in their band", () => {
	const names = (list) => list.map((one) => one.name)
	const tickets = () => ["A", "B", "C", "D"].map((name, index) => order(["Pending"], { name, modified: `2026-10-30 12:0${index}:00` }))

	it("puts the blinking ones first, in the order they blink, the others keeping their order of arrival", () => {
		expect(names(pinFlashing(tickets(), ["C", "B"]))).toEqual(["C", "B", "A", "D"])
	})

	it("changes nothing, and hands back the same list, when no ticket blinks", () => {
		const list = tickets()

		expect(pinFlashing(list, [])).toBe(list)
		expect(pinFlashing(list, undefined)).toBe(list)
	})

	it("ignores a blinking name the band does not hold, and does not change the list it was given", () => {
		const list = tickets()

		expect(names(pinFlashing(list, ["Z", "D"]))).toEqual(["D", "A", "B", "C"])
		expect(names(list)).toEqual(["A", "B", "C", "D"])
	})
})

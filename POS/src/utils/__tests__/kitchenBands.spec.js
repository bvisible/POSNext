/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen screen splits its tickets into the ones waiting and
 * //// the ones in preparation, each in order of arrival (NeoRestau lot 1, task 23). The split and the order live in a
 * //// helper of their own so that they are read, and tested, apart from the screen that draws them.
 */
import { describe, expect, it } from "vitest"
import {
	BAND_PRODUCTION,
	BAND_WAITING,
	arrivalOf,
	bandOf,
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

	it("is the end of time when nothing can be read, so that an unreadable ticket sinks instead of passing for the oldest", () => {
		expect(arrivalOf({})).toBe(Number.POSITIVE_INFINITY)
		expect(arrivalOf({ modified: "not a date" })).toBe(Number.POSITIVE_INFINITY)
	})
})

describe("splitting the tickets into the two bands", () => {
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

	it("drops the delivered tickets, and brings them back in the band of what was started when asked to", () => {
		const done = order(["Delivered"], {
			name: "DONE",
			kds_status: "Delivered",
			modified: "2026-10-30 12:30:00",
		})
		const live = order(["Preparing"], {
			name: "LIVE",
			modified: "2026-10-30 12:00:00",
		})

		expect(splitIntoBands([done, live]).production.map((o) => o.name)).toEqual([
			"LIVE",
		])
		expect(
			splitIntoBands([done, live], { includeDelivered: true }).production.map(
				(o) => o.name,
			),
		).toEqual(["LIVE", "DONE"])
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

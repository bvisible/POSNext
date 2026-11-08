/**
 * //// Neoffice — added file (no upstream equivalent). What the closing of a shift says is still open (NeoResto lot 1, the product owner, 08.11.2026):
 * the tickets held on the device (signing out erases them), and the open orders of the restaurant (the closing does not count them), with what the
 * manager must know of each: money posted, a dish served (a debt, never a draft to delete), or nothing served yet.
 */
import { beforeAll, describe, expect, it } from "vitest"

import {
	badgesOfOrder,
	cashHint,
	heldTicketsNotice,
	heldTicketsOf,
	openOrdersLine,
	quietFor,
	summaryOfOpenOrders,
} from "../stillOpenAtClosing"

beforeAll(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

const cart = (extra = {}) => ({ draft_id: 1, items: [{ item_code: "A" }], pos_profile: "Caisse", ...extra })
const order = (extra = {}) => ({
	name: "SINV-1",
	label: "T1",
	grand_total: 10,
	holds_money: false,
	consumed: false,
	served: false,
	...extra,
})

describe("the tickets held on this device", () => {
	it("counts a ticket that carries a line and leaves an empty one out", () => {
		const held = heldTicketsOf([cart({ draft_id: 1 }), cart({ draft_id: 2, items: [] }), { draft_id: 3 }], "Caisse")

		expect(held.map((ticket) => ticket.id)).toEqual([1])
	})

	it("keeps the tickets of this till's profile, and a ticket written before the profile was kept", () => {
		const held = heldTicketsOf(
			[cart({ draft_id: 1 }), cart({ draft_id: 2, pos_profile: "Bar" }), cart({ draft_id: 3, pos_profile: undefined })],
			"Caisse",
		)

		expect(held.map((ticket) => ticket.id)).toEqual([1, 3])
	})

	it("counts every ticket when the till's profile is not known yet", () => {
		expect(heldTicketsOf([cart({ pos_profile: "Bar" }), cart({ draft_id: 2 })], undefined)).toHaveLength(2)
	})

	it("says the table, the customer and the lines of each", () => {
		const [ticket] = heldTicketsOf([cart({ restaurant_table: "T4", customer: "Walk-in", items: [{}, {}] })], "Caisse")

		expect(ticket).toMatchObject({ table: "T4", customer: "Walk-in", lines: 2 })
	})

	it("survives what is not a list", () => {
		expect(heldTicketsOf(null, "Caisse")).toEqual([])
		expect(heldTicketsOf("x", "Caisse")).toEqual([])
	})

	it("tells how many sign-out will erase, in the singular and the plural, and nothing for none", () => {
		expect(heldTicketsNotice(0)).toBe("")
		expect(heldTicketsNotice(1)).toBe("1 held ticket on this device will be erased when you sign out")
		expect(heldTicketsNotice(3)).toBe("3 held tickets on this device will be erased when you sign out")
		expect(heldTicketsNotice("x")).toBe("")
	})
})

describe("how long an order has been quiet", () => {
	it("says minutes under an hour and hours with two-digit minutes after", () => {
		expect(quietFor(0)).toBe("Quiet for 0 min")
		expect(quietFor(45)).toBe("Quiet for 45 min")
		expect(quietFor(65)).toBe("Quiet for 1 h 05")
		expect(quietFor(200)).toBe("Quiet for 3 h 20")
	})

	it("never goes negative nor reads a number out of nothing", () => {
		expect(quietFor(-5)).toBe("Quiet for 0 min")
		expect(quietFor(undefined)).toBe("Quiet for 0 min")
	})
})

describe("what the manager must know of an open order", () => {
	const keys = (value) => badgesOfOrder(value).map((badge) => badge.key)

	it("tells that nothing was served when nothing was", () => {
		expect(keys(order())).toEqual(["untouched"])
	})

	it("tells a dish was served (a debt, never a draft to delete), partly or all", () => {
		expect(keys(order({ consumed: true }))).toEqual(["partly"])
		expect(keys(order({ consumed: true, served: true }))).toEqual(["served"])
	})

	it("tells the money posted on a draft first, whatever else is said", () => {
		expect(keys(order({ holds_money: true }))).toEqual(["money", "untouched"])
		expect(keys(order({ holds_money: true, consumed: true, served: true }))).toEqual(["money", "served"])
	})

	it("gives money the danger tone, a served dish the warning one", () => {
		const tones = Object.fromEntries(
			badgesOfOrder(order({ holds_money: true, consumed: true })).map((badge) => [badge.key, badge.tone]),
		)

		expect(tones).toEqual({ money: "danger", partly: "warning" })
	})
})

describe("the totals of the open orders", () => {
	it("counts them, sums their totals and tells how many are a debt or hold money", () => {
		const summary = summaryOfOpenOrders([
			order({ grand_total: 10.5 }),
			order({ name: "B", grand_total: 20, consumed: true }),
			order({ name: "C", grand_total: 5, holds_money: true }),
		])

		expect(summary).toEqual({ count: 3, total: 35.5, consumed: 1, holdsMoney: 1, untouched: 1 })
	})

	it("is empty for no order", () => {
		expect(summaryOfOpenOrders([])).toEqual({ count: 0, total: 0, consumed: 0, holdsMoney: 0, untouched: 0 })
		expect(summaryOfOpenOrders(undefined).count).toBe(0)
	})

	it("says the open orders are not in the figures of the closing", () => {
		expect(openOrdersLine(0)).toBe("")
		expect(openOrdersLine(1)).toBe("1 order is still open: it is not in the figures of this closing")
		expect(openOrdersLine(4)).toBe("4 orders are still open: they are not in the figures of this closing")
	})
})

describe("the hint when the cash is over", () => {
	const some = { count: 2 }

	it("is given when the cash is over while orders are open", () => {
		expect(cashHint(some, true)).toMatch(/may have been paid in cash and not cashed in/)
	})

	it("is not given when the cash is not over, or nothing is open, or nobody sees the difference", () => {
		expect(cashHint(some, false)).toBe("")
		expect(cashHint({ count: 0 }, true)).toBe("")
		expect(cashHint(undefined, true)).toBe("")
	})
})

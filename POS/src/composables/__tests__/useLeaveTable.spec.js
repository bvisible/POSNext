/**
 * //// Neoffice — added file (no upstream equivalent). Leaving a table after a dish that had left for the kitchen was taken off the order (NeoResto lot 1, product owner, 03.11.2026): the removal was
 * //// lost without a word and the kitchen cooked the dish. « Back » now asks: send the cancellation to the kitchen, put the order back as it was, or stay on the table.
 * @vitest-environment jsdom
 */
import { reactive } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useLeaveTable } from "../useLeaveTable"

const removed = [{ item_code: "SOUP", item_name: "Soup", quantity: 1 }]

function setup({ cart = {}, send = vi.fn(async () => true), putBack = vi.fn(async () => {}) } = {}) {
	const cartStore = reactive({
		removedSentLines: [],
		invoiceItems: [{ item_code: "STEAK", kds_status: "Pending" }],
		restaurantTable: { name: "T1" },
		isTakeaway: false,
		...cart,
	})
	const leave = vi.fn()
	return { cartStore, leave, send, putBack, ...useLeaveTable({ cartStore, send, putBack, leave }) }
}

describe("leaving a table", () => {
	beforeEach(() => vi.clearAllMocks())

	it("leaves at once when no sent dish was taken off", () => {
		const ctx = setup()

		ctx.requestLeave()

		expect(ctx.leave).toHaveBeenCalledTimes(1)
		expect(ctx.asking.value).toBe(false)
	})

	it("asks first when a sent dish was taken off, and does not leave yet", () => {
		const ctx = setup({ cart: { removedSentLines: removed } })

		ctx.requestLeave()

		expect(ctx.asking.value).toBe(true)
		expect(ctx.leave).not.toHaveBeenCalled()
		expect(ctx.removed.value).toEqual(removed)
	})

	it("sends the cancellation, and the dialog is gone once the kitchen has it", async () => {
		const ctx = setup({ cart: { removedSentLines: removed } })
		ctx.requestLeave()

		await ctx.sendCancellation()

		expect(ctx.send).toHaveBeenCalledTimes(1)
		expect(ctx.asking.value).toBe(false)
	})

	it("keeps the dialog open when the cancellation did not go, so that nothing is lost", async () => {
		const ctx = setup({ cart: { removedSentLines: removed }, send: vi.fn(async () => false) })
		ctx.requestLeave()

		await ctx.sendCancellation()

		expect(ctx.asking.value).toBe(true)
		expect(ctx.leave).not.toHaveBeenCalled()
	})

	it("sends the cancellation once, even when pressed twice", async () => {
		let release
		const send = vi.fn(() => new Promise((resolve) => (release = resolve)))
		const ctx = setup({ cart: { removedSentLines: removed }, send })
		ctx.requestLeave()

		const first = ctx.sendCancellation()
		const second = ctx.sendCancellation()
		release(true)
		await Promise.all([first, second])

		expect(send).toHaveBeenCalledTimes(1)
	})

	it("puts the order back as it was, and stays on the table", async () => {
		const ctx = setup({ cart: { removedSentLines: removed } })
		ctx.requestLeave()

		await ctx.putTheOrderBack()

		expect(ctx.putBack).toHaveBeenCalledTimes(1)
		expect(ctx.asking.value).toBe(false)
		expect(ctx.leave).not.toHaveBeenCalled()
	})

	it("stays without doing anything", () => {
		const ctx = setup({ cart: { removedSentLines: removed } })
		ctx.requestLeave()

		ctx.stay()

		expect(ctx.asking.value).toBe(false)
		expect(ctx.send).not.toHaveBeenCalled()
		expect(ctx.putBack).not.toHaveBeenCalled()
		expect(ctx.leave).not.toHaveBeenCalled()
	})

	it("asks about the lines not sent yet, which a way back would lose (Daniel, 03.11)", () => {
		const ctx = setup({ cart: { invoiceItems: [{ item_code: "STEAK", kds_status: "Pending" }, { item_code: "CAKE", kds_status: "" }] } })

		ctx.requestLeave()

		expect(ctx.asking.value).toBe(true)
		expect(ctx.leave).not.toHaveBeenCalled()
		expect(ctx.removed.value).toEqual([])
		expect(ctx.unsentCount.value).toBe(1)
	})

	it("leaves at once when the lines left are all sent or held back, and a gift row of an offer is no line", () => {
		const held = setup({ cart: { invoiceItems: [{ item_code: "WINE", kds_status: "Waiting" }, { item_code: "GIFT", kds_status: "", is_free_item: 1 }] } })

		held.requestLeave()

		expect(held.leave).toHaveBeenCalledTimes(1)
		expect(held.asking.value).toBe(false)
	})

	it("does not ask a second time what the phone has just asked", () => {
		const ctx = setup({ cart: { invoiceItems: [{ item_code: "CAKE", kds_status: "" }] } })

		ctx.requestLeave({ unsentAsked: true })

		expect(ctx.leave).toHaveBeenCalledTimes(1)
		expect(ctx.asking.value).toBe(false)
	})

	it("names the lines not sent in the question about a dish taken off, unless the phone has asked about them", () => {
		const lines = [{ item_code: "STEAK", kds_status: "Pending" }, { item_code: "CAKE", kds_status: "" }, { item_code: "PIE", kds_status: "" }]
		const plain = setup({ cart: { removedSentLines: removed, invoiceItems: lines } })
		const asked = setup({ cart: { removedSentLines: removed, invoiceItems: lines } })

		plain.requestLeave()
		asked.requestLeave({ unsentAsked: true })

		expect(plain.asking.value).toBe(true)
		expect(plain.unsentCount.value).toBe(2)
		expect(asked.asking.value).toBe(true)
		expect(asked.unsentCount.value).toBe(0)
	})

	it("leaves anyway when the waiter says so, after the question about the lines not sent", () => {
		const ctx = setup({ cart: { invoiceItems: [{ item_code: "CAKE", kds_status: "" }] } })
		ctx.requestLeave()

		ctx.leaveAnyway()

		expect(ctx.leave).toHaveBeenCalledTimes(1)
		expect(ctx.asking.value).toBe(false)
	})

	it("says the order is emptied when the dish taken off was the last one the saved order had", () => {
		expect(setup().emptied.value).toBe(false)
		// Only a line never sent is left: nothing the kitchen has, nothing saved
		expect(setup({ cart: { invoiceItems: [{ item_code: "CAKE", kds_status: "" }] } }).emptied.value).toBe(true)
		expect(setup({ cart: { invoiceItems: [] } }).emptied.value).toBe(true)
		// A course held back is saved with the order: the order is not emptied
		expect(setup({ cart: { invoiceItems: [{ item_code: "WINE", kds_status: "Waiting" }] } }).emptied.value).toBe(false)
	})

	it("can put a table's order back, and a takeaway's it cannot (it has no table to read again)", () => {
		expect(setup().canPutBack.value).toBe(true)
		expect(setup({ cart: { isTakeaway: true } }).canPutBack.value).toBe(false)
		expect(setup({ cart: { restaurantTable: null } }).canPutBack.value).toBe(false)
	})
})

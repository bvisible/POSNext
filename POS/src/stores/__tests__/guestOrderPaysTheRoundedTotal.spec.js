/**
 * //// Neoffice — added file (no upstream equivalent). A table or a takeaway order costs on the phone what the till takes for it: its total
 * //// rounded as the till rounds it (maintenance#2254). The page counted the exact total, 9.98 where the till takes 10.00 for the same order,
 * //// and an order whose total rounds down (9.97, 9.95 at the till) never read paid. The server says the rounding; the store counts with it.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

const { useGuestOrderStore } = await import("../guestOrder")

function theServerSays(status) {
	globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ message: status }) }))
}

async function anOrder(status) {
	const store = useGuestOrderStore()
	store.token = "e_abc"
	theServerSays({ invoice: "SINV-1", items: [], paid_amount: 0, ...status })
	await store.refreshOrderStatus()
	return store
}

beforeEach(() => {
	setActivePinia(createPinia())
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe("the order of a table", () => {
	it("owes the total the till takes, rounded", async () => {
		const store = await anOrder({ grand_total: 9.98, rounding: 0.02 })

		expect(store.amountDue).toBe(10)
		expect(store.remainingAmount).toBe(10)
	})

	it("is paid once the rounded total is paid, and not before", async () => {
		const store = await anOrder({ grand_total: 9.98, rounding: 0.02, paid_amount: 9.98 })
		expect(store.isFullyPaid).toBe(false)
		expect(store.remainingAmount).toBe(0.02)

		const paid = await anOrder({ grand_total: 9.98, rounding: 0.02, paid_amount: 10 })
		expect(paid.isFullyPaid).toBe(true)
	})

	it("rounded down, is paid by the lower amount the till takes", async () => {
		const store = await anOrder({ grand_total: 9.97, rounding: -0.02, paid_amount: 9.95 })

		expect(store.isFullyPaid).toBe(true)
		expect(store.remainingAmount).toBe(0)
	})

	it("keeps the exact total where the server says no rounding", async () => {
		const store = await anOrder({ grand_total: 9.98 })

		expect(store.amountDue).toBe(9.98)
		expect(store.remainingAmount).toBe(9.98)
	})
})

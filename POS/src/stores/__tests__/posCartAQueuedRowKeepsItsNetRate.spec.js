/**
 * //// Neoffice — added file (no upstream equivalent). A queued sale put back in the cart keeps the price it was billed at
 * //// (NeoResto lot 1, task 15, money review of 01.11). The rows of a queued invoice carry the rate AFTER the discount and
 * //// the discount percentage as well; a row whose rate was set by hand took its percentage back to the cart, so editing the
 * //// sale took the discount a second time: a hand-set 8.00 given 10 % off was queued at 7.20 and came back at 6.48.
 * //// A row at the LIST price lost its discount the other way (neoffice-maintenance#2074): the cart bills such a line from its list
 * //// price and its percentage, the percentage was zeroed, and a 9.00 row of a 10.00 list price came back at 10.00.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? `${s} ${args.join(" ")}` : s)
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showWarning: vi.fn(),
		showInfo: vi.fn(),
	}),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({
		shouldEnforceStockValidation: () => false,
	}),
}))

const { usePOSCartStore } = await import("../posCart")
const { storedRowTerms } = await import("@/utils/linePriceTerms")

// A hand-set 8.00 (list price 10.00) given 10 % off, as formatItemsForSubmission queues it: the rate is net of the discount
const QUEUED_BY_HAND = {
	item_code: "tea",
	item_name: "Tea",
	qty: 1,
	rate: 7.2,
	price_list_rate: 10,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	discount_percentage: 10,
	discount_amount: 0,
	is_rate_manually_edited: 1,
	original_rate: 10,
}
// A line at the list price (10.00) given 10 % off, as formatItemsForSubmission queues it: the rate is net of the discount, the row says so
const QUEUED_AT_LIST = {
	item_code: "tea",
	item_name: "Tea",
	qty: 1,
	rate: 9,
	price_list_rate: 10,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	discount_percentage: 10,
	discount_amount: 1,
	is_rate_manually_edited: 0,
	original_rate: null,
}
describe("a queued sale put back in the cart keeps the price it was billed at", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
	})

	it("a row whose rate was set by hand comes back at the queued rate, not discounted a second time", () => {
		cart.addItem(storedRowTerms(QUEUED_BY_HAND), 1, true, null)

		const [line] = cart.invoiceItems
		expect(line.rate).toBe(7.2)
		expect(line.discount_percentage).toBe(0)
		expect(line.amount).toBeCloseTo(7.2, 2)
		expect(line.is_rate_manually_edited).toBe(1)
	})

	it("the quantity of the row is kept", () => {
		cart.addItem(storedRowTerms({ ...QUEUED_BY_HAND, qty: 3 }), 3, true, null)

		const [line] = cart.invoiceItems
		expect(line.quantity).toBe(3)
		expect(line.amount).toBeCloseTo(21.6, 2)
	})

	it("a row at the list price comes back with its discount: billed what was queued, not the list price", () => {
		cart.addItem(storedRowTerms(QUEUED_AT_LIST), 1, true, null)

		const [line] = cart.invoiceItems
		expect(line.amount).toBeCloseTo(9, 2)
		expect(line.discount_percentage).toBe(10)
		expect(line.discount_amount).toBeCloseTo(1, 2)
		expect(line.price_list_rate).toBe(10)
		expect(line.is_rate_manually_edited ?? 0).toBe(0)
	})

	it("a row discounted by an amount alone (no percentage) comes back at the queued price too", () => {
		const byAmount = { ...QUEUED_AT_LIST, discount_percentage: 0, discount_amount: 1 }
		cart.addItem(storedRowTerms(byAmount), 1, true, null)

		const [line] = cart.invoiceItems
		expect(line.amount).toBeCloseTo(9, 2)
		expect(line.discount_percentage).toBeCloseTo(10, 2)
	})

	it("the quantity of a discounted row is kept, and the discount is taken once", () => {
		cart.addItem(storedRowTerms({ ...QUEUED_AT_LIST, qty: 3 }), 3, true, null)

		const [line] = cart.invoiceItems
		expect(line.quantity).toBe(3)
		expect(line.amount).toBeCloseTo(27, 2)
	})

	it("two rows with the same terms merge, a row with other terms stays a line of its own", () => {
		cart.addItem(storedRowTerms(QUEUED_AT_LIST), 1, true, null)
		cart.addItem(storedRowTerms(QUEUED_AT_LIST), 1, true, null)
		expect(cart.invoiceItems).toHaveLength(1)
		expect(cart.invoiceItems[0].amount).toBeCloseTo(18, 2)

		cart.addItem(storedRowTerms({ ...QUEUED_AT_LIST, rate: 10, discount_percentage: 0, discount_amount: 0 }), 1, true, null)
		expect(cart.invoiceItems).toHaveLength(2)
		expect(cart.invoiceItems[1].amount).toBeCloseTo(10, 2)
	})
})

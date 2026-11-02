/**
 * //// Neoffice — added file (no upstream equivalent). A queued sale put back in the cart keeps the price it was billed at
 * //// (NeoResto lot 1, task 15, money review of 01.11). The rows of a queued invoice carry the rate AFTER the discount and
 * //// the discount percentage as well; a row whose rate was set by hand took its percentage back to the cart, so editing the
 * //// sale took the discount a second time: a hand-set 8.00 given 10 % off was queued at 7.20 and came back at 6.48.
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
})

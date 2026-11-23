/**
 * //// Neoffice — added file (no upstream equivalent). A rule's header discount follows the cart as the coupon's does
 * //// (posCartDiscountFollowsTheCart): a gift card whose Pricing Rule fires as an offer (the « Offres 1 » badge) puts a FIXED
 * //// amount in ruleHeaderDiscount, which wins over the card while it applies. Lines taken off the cart left that amount above
 * //// what is owed: a card of 73.40 on a cart of 126.60, the 76.60 line removed, gave a total of -23.40 and a payment window that
 * //// said « paid online » while its button did nothing (the till's screen test of 23.11.2026, maintenance#3201 point 1).
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { nextTick } from "vue"
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
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

const { usePOSCartStore } = await import("../posCart")

const line = (code, price) => ({
	item_code: code,
	item_name: code,
	rate: price,
	price_list_rate: price,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
})

describe("the discount of a rule follows the cart", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		cart.addItem(line("A", 76.6))
		cart.addItem(line("B", 50))
	})

	it("a fixed rule amount above what is owed is capped when a line is removed", async () => {
		// The card's own rule fires as an offer: its fixed amount is the header discount
		cart.applyHeaderDiscountFromServer({ discountAmount: 73.4 })
		expect(cart.grandTotal).toBe(53.2)

		cart.removeItem("A", "Nos")
		await nextTick()

		// 50.00 are owed: the rule's 73.40 cannot take more than that
		expect(cart.effectiveHeaderDiscount).toBe(50)
		expect(cart.grandTotal).toBe(0)
	})

	it("a rule amount below what is owed is left as it is", async () => {
		cart.applyHeaderDiscountFromServer({ discountAmount: 20 })

		cart.removeItem("A", "Nos")
		await nextTick()

		expect(cart.effectiveHeaderDiscount).toBe(20)
		expect(cart.grandTotal).toBe(30)
	})

	it("the rule amount is not lowered for good: the line comes back, so does the discount", async () => {
		cart.applyHeaderDiscountFromServer({ discountAmount: 73.4 })

		cart.removeItem("A", "Nos")
		await nextTick()
		cart.addItem(line("A", 76.6))
		await nextTick()

		expect(cart.effectiveHeaderDiscount).toBe(73.4)
		expect(cart.grandTotal).toBe(53.2)
	})

	it("a cart whose total is never below zero, whatever the rule says", async () => {
		cart.applyHeaderDiscountFromServer({ discountAmount: 1000 })
		await nextTick()

		expect(cart.grandTotal).toBeGreaterThanOrEqual(0)
		expect(cart.effectiveHeaderDiscount).toBeLessThanOrEqual(126.6)
	})
})

/**
 * //// Neoffice — added file (no upstream equivalent). The discount of a coupon, a gift card or a manual amount follows the cart:
 * //// it was capped only when it was applied, so removing lines left a discount above what is owed (a card of 150.00 on a cart of
 * //// 76.60, then two lines removed: Total général -46.60, the payment window stuck on a « paid online » surplus that never was;
 * //// maintenance#3201). It only goes down, never up: the amount the cashier chose is hers.
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

// What the coupon dialog hands the cart for a gift card of 150.00 on a cart of 76.60
const card = {
	code: "GC-TEST",
	name: "GC-TEST",
	percentage: 0,
	amount: 76.6,
	isGiftCard: true,
	availableBalance: 150,
	remainingBalance: 73.4,
	base_amount: 76.6,
}

describe("the discount follows the cart", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		cart.addItem(line("A", 30))
		cart.addItem(line("B", 25.6))
		cart.addItem(line("C", 21))
	})

	it("a gift card is capped again on what is owed when lines are removed", async () => {
		cart.applyDiscountToCart({ ...card })
		expect(cart.grandTotal).toBe(0)

		cart.removeItem("B", "Nos")
		cart.removeItem("C", "Nos")
		await nextTick()

		expect(cart.additionalDiscount).toBe(30)
		expect(cart.grandTotal).toBe(0)
		expect(cart.appliedCoupon.amount).toBe(30)
		// What stays on the card is what it holds less what this sale takes
		expect(cart.appliedCoupon.remainingBalance).toBe(120)
	})

	it("a manual discount is capped again as well", async () => {
		cart.$patch({ additionalDiscount: 50 })
		expect(cart.grandTotal).toBe(26.6)

		cart.removeItem("B", "Nos")
		cart.removeItem("C", "Nos")
		await nextTick()

		expect(cart.additionalDiscount).toBe(30)
		expect(cart.grandTotal).toBe(0)
	})

	it("the discount never goes up when a line is added", async () => {
		cart.applyDiscountToCart({ ...card })

		cart.addItem(line("D", 10))
		await nextTick()

		expect(cart.additionalDiscount).toBe(76.6)
		expect(cart.grandTotal).toBe(10)
	})

	it("a discount that is below what is owed stays as it is when a line is removed", async () => {
		cart.$patch({ additionalDiscount: 10 })

		cart.removeItem("C", "Nos")
		await nextTick()

		expect(cart.additionalDiscount).toBe(10)
		expect(cart.grandTotal).toBe(45.6)
	})

	it("a cart emptied then filled again never shows a negative total", async () => {
		cart.applyDiscountToCart({ ...card })

		for (const code of ["A", "B", "C"]) cart.removeItem(code, "Nos")
		await nextTick()
		cart.addItem(line("D", 10))
		await nextTick()

		// Whether the cart let the card go with its last line or kept it, the discount is never above what is owed
		expect(cart.additionalDiscount).toBeLessThanOrEqual(10)
		expect(cart.grandTotal).toBeGreaterThanOrEqual(0)
	})
})

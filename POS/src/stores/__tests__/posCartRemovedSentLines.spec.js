/**
 * //// Neoffice — added file (no upstream equivalent). The cart remembers what had left for the kitchen when a table was opened, and says which dishes were taken off since (NeoResto lot 1,
 * //// product owner, 03.11.2026: « Back » after removing a sent dish lost the removal without a word).
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
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() }),
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

const { usePOSCartStore } = await import("../posCart")

const dish = (code, extra = {}) => ({ item_code: code, item_name: code, rate: 10, price_list_rate: 10, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, ...extra })

describe("the dishes taken off an order after they had left for the kitchen", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		cart.addItem(dish("SOUP", { kds_status: "Pending" }))
		cart.addItem(dish("STEAK", { kds_status: "Pending" }))
		cart.addItem(dish("TART"))
	})

	it("is nothing until the table's lines were remembered", () => {
		cart.removeItem("SOUP", "Nos")
		expect(cart.removedSentLines).toEqual([])
	})

	it("names the sent dish that was taken off", () => {
		cart.rememberSentLines()
		cart.removeItem("SOUP", "Nos")

		expect(cart.removedSentLines).toEqual([expect.objectContaining({ item_code: "SOUP", quantity: 1 })])
	})

	it("does not name a line that had not been sent", () => {
		cart.rememberSentLines()
		cart.removeItem("TART", "Nos")

		expect(cart.removedSentLines).toEqual([])
	})

	it("forgets them when the cart is cleared", async () => {
		cart.rememberSentLines()
		cart.removeItem("SOUP", "Nos")
		await cart.clearCart()

		expect(cart.removedSentLines).toEqual([])
	})

	it("remembers the lines again for the order read back", () => {
		cart.rememberSentLines()
		cart.removeItem("SOUP", "Nos")
		cart.rememberSentLines()

		expect(cart.removedSentLines).toEqual([])
	})
})

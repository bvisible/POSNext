/**
 * //// Neoffice — added file (no upstream equivalent). Clearing the customer must not drop an
 * //// applied gift card or coupon: our customer card clears the customer on every "change
 * //// customer" tap (4a0dd461) and a gift card is a bearer card. The coupon is re-checked against
 * //// the next customer picked, and upstream's drop still happens there when the server refuses it.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

const toast = vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? `${s} ${args.join(" ")}` : s)
	return {}
})
const { call } = vi.hoisted(() => ({ call: vi.fn(async () => ({ valid: true })) }))
vi.mock("frappe-ui", () => ({
	call,
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => {
		Object.assign(toast, { showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() })
		return toast
	},
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

const { usePOSCartStore } = await import("../posCart")

const coffee = { item_code: "COFFEE", item_name: "Coffee", rate: 50, price_list_rate: 50, uom: "Nos", stock_uom: "Nos", conversion_factor: 1 }
const settle = async () => {
	await nextTick()
	await new Promise((resolve) => setTimeout(resolve, 0))
	await nextTick()
}

describe("posCart: clearing the customer keeps the gift card or coupon", () => {
	let cart
	beforeEach(async () => {
		call.mockReset()
		call.mockImplementation(async () => ({ valid: true }))
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		cart.addItem({ ...coffee })
		cart.customer = "CUST-1"
		await settle()
	})

	it("keeps a gift card applied when the customer is cleared", async () => {
		cart.applyDiscountToCart({
			name: "GC-0001",
			code: "GC-0001",
			percentage: 0,
			amount: 30,
			isGiftCard: true,
			availableBalance: 30,
			remainingBalance: 0,
		})
		await settle()
		expect(cart.appliedCoupon?.code).toBe("GC-0001")

		cart.customer = null
		await settle()

		expect(cart.appliedCoupon?.code).toBe("GC-0001")
		expect(cart.additionalDiscount).toBe(30)
		expect(toast.showWarning).not.toHaveBeenCalled()
	})

	it("keeps a coupon while no customer is selected, and re-checks it for the next one", async () => {
		cart.applyDiscountToCart({ name: "WELCOME10", code: "WELCOME10", percentage: 0, amount: 5 })
		await settle()

		cart.customer = null
		await settle()
		expect(cart.appliedCoupon?.code).toBe("WELCOME10")
		expect(call).not.toHaveBeenCalled()

		call.mockImplementation(async () => ({ valid: false, message: "Not for this customer" }))
		cart.customer = "CUST-2"
		await vi.waitFor(() => expect(cart.appliedCoupon).toBeNull())
		expect(call).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ coupon_code: "WELCOME10", customer: "CUST-2" })
		)
		expect(toast.showWarning).toHaveBeenCalledWith(expect.stringContaining("WELCOME10"))
	})
})

/**
 * //// Neoffice — added file (no upstream equivalent). A table ticket and the counter sale after it
 * //// go through the same store, and the second must not be saved on the table of the first. The
 * //// table reaches submit_invoice through useInvoice's own copy (setRestaurantTable mirrors it
 * //// there), so clearCart has to clear that copy too, not only the store's.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? `${s} ${args.join(" ")}` : s)
	return { sent: [] }
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	// Records what each endpoint is sent. The two invoice endpoints answer with the invoice's name,
	// every other one (offers, draft cleanup) with an empty but well-formed result.
	createResource: (options) => {
		const url = options?.url ?? ""
		const submit = vi.fn(async (params) => {
			server.sent.push({ url, params })
			if (url.endsWith("update_invoice") || url.endsWith("submit_invoice")) {
				return { name: "SINV-0001" }
			}
			return { items: [], free_items: [], applied_pricing_rules: [], discount_amount: 0 }
		})
		return { submit, reload: vi.fn(), fetch: vi.fn() }
	},
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() }),
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

const { usePOSCartStore } = await import("../posCart")

const burger = { item_code: "BURGER", item_name: "Burger", rate: 20, price_list_rate: 20, uom: "Nos", stock_uom: "Nos", conversion_factor: 1 }

// The table the last submit_invoice call was asked to book the invoice on
const submittedTable = () =>
	server.sent.filter((call) => call.url.endsWith("submit_invoice")).at(-1).params.invoice.restaurant_table

describe("a ticket does not inherit the table of the ticket before it", () => {
	let cart
	beforeEach(() => {
		server.sent = []
		setActivePinia(createPinia())
		cart = usePOSCartStore()
	})

	it("saves the next counter sale on no table once the table's ticket is paid", async () => {
		cart.setRestaurantTable({ name: "T3" })
		cart.addItem({ ...burger })
		cart.customer = "CUST-1"
		await cart.submitInvoice()
		// The table's own ticket does carry its table: that is how the server frees it
		expect(submittedTable()).toBe("T3")

		// What the till does once the sale is booked, then the next customer pays at the counter
		await cart.clearCart({ returnSerials: false })
		cart.addItem({ ...burger })
		cart.customer = "CUST-2"
		await cart.submitInvoice()

		expect(cart.restaurantTable).toBeNull()
		expect(submittedTable()).toBeNull()
	})

	it("saves a ticket on the table picked right after the clear", async () => {
		// Guest-order refresh and floor-plan reopen both do `await clearCart()` then `setRestaurantTable()`
		cart.setRestaurantTable({ name: "T3" })
		await cart.clearCart()
		cart.setRestaurantTable({ name: "T5" })
		cart.addItem({ ...burger })
		cart.customer = "CUST-1"
		await cart.submitInvoice()

		expect(submittedTable()).toBe("T5")
	})
})

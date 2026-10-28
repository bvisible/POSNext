/**
 * //// Neoffice — added file (no upstream equivalent). POSSale forwards both shapes InvoiceCart emits
 * //// for remove-item to removeItem(): the line object from the remove button (the same dish can sit
 * //// twice with different product options, 7e1376a3) and (item_code, uom) from the quantity paths.
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

const burger = { item_code: "BURGER", item_name: "Burger", rate: 20, price_list_rate: 20, uom: "Nos", stock_uom: "Nos", conversion_factor: 1 }

describe("removeItem takes the line object or (item_code, uom)", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		// Two lines of the same dish: options make them separate lines (never merged)
		cart.addItem({ ...burger, posa_special_instructions: "no onion" })
		cart.addItem({ ...burger, posa_special_instructions: "extra cheese" })
	})

	it("removes exactly the line it is given", () => {
		expect(cart.invoiceItems).toHaveLength(2)
		const second = cart.invoiceItems.find((i) => i.posa_special_instructions === "extra cheese")
		cart.removeItem(second)
		expect(cart.invoiceItems).toHaveLength(1)
		expect(cart.invoiceItems[0].posa_special_instructions).toBe("no onion")
	})

	it("removes one line of that code and unit when given (item_code, uom)", () => {
		cart.removeItem("BURGER", "Nos")
		expect(cart.invoiceItems).toHaveLength(1)
		cart.removeItem("BURGER", "Box")
		expect(cart.invoiceItems).toHaveLength(1)
	})
})

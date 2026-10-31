/**
 * //// Neoffice — added file (no upstream equivalent). An option of a dish moves its price either way: « + 2.00 » for a
 * //// sauce, « − 1.50 » for no side. The cart applied a lowering only when it replaced an earlier adjustment, never as
 * //// the first one nor after the options went back to zero: the dish stayed at its full price while the options
 * //// sheet of the phone (NeoRestau lot 1, task 27) and the options dialog both show the lowering.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({})),
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

const steak = { item_code: "STEAK", item_name: "Steak", rate: 42, uom: "Nos", stock_uom: "Nos", conversion_factor: 1 }

describe("an option that changes the price of a dish", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		cart.addItem({ ...steak, posa_special_instructions: "options" })
	})

	const choose = (adjustment) => cart.updateItemModifiers("STEAK", "Nos", "[]", "options", adjustment, 0, 0)

	it("lowers it as the first choice", () => {
		choose(-1.5)

		expect(cart.invoiceItems[0].rate).toBe(40.5)
		expect(cart.invoiceItems[0].amount).toBe(40.5)
	})

	it("raises it, takes it back, and lowers it again", () => {
		choose(2)
		expect(cart.invoiceItems[0].rate).toBe(44)
		choose(0)
		expect(cart.invoiceItems[0].rate).toBe(42)
		choose(-1.5)
		expect(cart.invoiceItems[0].rate).toBe(40.5)
		choose(6)
		expect(cart.invoiceItems[0].rate).toBe(48)
	})
})

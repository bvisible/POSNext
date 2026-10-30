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
const { nestFreeRows } = await import("@/utils/gwpSameItemFreeRows")

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

	// The cart lists what nestFreeRows gives it, and nestFreeRows (upstream, 74c0aee5) hands out COPIES of
	// the lines: the remove button emits such a copy, which is not in the cart (osiris, 30.10: the bin did nothing).
	it("removes the line the cart shows, a displayed copy of it", () => {
		const shown = nestFreeRows(cart.invoiceItems)
		const extraCheese = shown.find((i) => i.posa_special_instructions === "extra cheese")
		cart.removeItem(extraCheese)
		expect(cart.invoiceItems).toHaveLength(1)
		expect(cart.invoiceItems[0].posa_special_instructions).toBe("no onion")
		expect(cart.subtotal).toBe(20)
	})

	it("a line that is not in the cart changes nothing, not even the totals", () => {
		const before = cart.subtotal
		cart.removeItem({ ...burger, posa_special_instructions: "never ordered" })
		expect(cart.invoiceItems).toHaveLength(2)
		expect(cart.subtotal).toBe(before)
	})
})

// The three row actions that address a line by identity hand over the cart row behind the copy shown
describe("the cart's row buttons hand over the cart row, not the copy shown", () => {
	it("remove, send to the kitchen and options all go through cartRowOf", async () => {
		const { readFileSync } = await import("node:fs")
		const path = await import("node:path")
		const source = readFileSync(path.resolve(__dirname, "../../components/sale/InvoiceCart.vue"), "utf8")
		for (const event of ["remove-item", "send-item-to-kitchen", "open-modifiers"]) {
			expect(source).toContain(`$emit('${event}', cartRowOf(item))`)
			expect(source).not.toContain(`$emit('${event}', item)`)
		}
	})
})

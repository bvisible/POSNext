/**
 * //// Neoffice — added file (no upstream equivalent). A "+" on a line read back from a table's order (neoffice-maintenance#2080): the order's lines
 * //// came back without `is_stock_item`, so the unit added to a line made a stock item of a service or of a non-stock dish (addItemToInvoice gives a
 * //// line with no flag `is_stock_item: 1`), and the stock validation then refused it, while the line it extends was never validated. The server now
 * //// sends the flag (open_table, get_table_order); the cart keeps it on the line it rebuilds (replaceAllItems) and on the line it opens (openTable),
 * //// and the "+" paths, which spread the line, hand it to the unit.
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
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => true }),
}))

const { usePOSCartStore } = await import("../posCart")
const { shouldValidateItemStock } = await import("@/utils/stockValidator")

// The lines of a table's order as the server sends them, a service and a stock dish
const SERVICE = { item_code: "svc", item_name: "Service", qty: 1, rate: 5, uom: "Unit", stock_uom: "Unit", conversion_factor: 1, is_stock_item: 0 }
const STOCKED = { item_code: "wine", item_name: "Wine", qty: 1, rate: 29, uom: "Unit", stock_uom: "Unit", conversion_factor: 1, is_stock_item: 1 }

describe("a unit added to a line read back from a table's order", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
	})

	it("keeps the line of a non-stock item as one (replaceAllItems), where it lost the flag", () => {
		cart.replaceAllItems([SERVICE])

		expect(cart.invoiceItems[0].is_stock_item).toBe(0)
	})

	it("makes the unit of a '+' on a noted line a non-stock unit, which the stock validation does not look at", () => {
		// A line with a note never takes a unit more: the unit is a plain line of its own, made from the noted one
		cart.replaceAllItems([{ ...SERVICE, posa_special_instructions: "no ice" }])

		expect(cart.addAPlainUnitOf(cart.invoiceItems[0])).toBe(true)

		expect(cart.invoiceItems).toHaveLength(2)
		for (const line of cart.invoiceItems) {
			expect(line.is_stock_item).toBe(0)
			expect(shouldValidateItemStock(line)).toBe(false)
		}
	})

	it("does the same for the units raised on a line that has left for the kitchen (they go on a line of their own)", () => {
		cart.replaceAllItems([{ ...SERVICE, kds_status: "Pending" }])

		cart.updateItemQuantity("svc", 2, "Unit", cart.invoiceItems[0])

		expect(cart.invoiceItems).toHaveLength(2)
		for (const line of cart.invoiceItems) {
			expect(line.is_stock_item).toBe(0)
			expect(shouldValidateItemStock(line)).toBe(false)
		}
	})

	it("leaves a stock item as it was: its unit is a stock item, validated like any other", () => {
		cart.replaceAllItems([{ ...STOCKED, posa_special_instructions: "chilled" }])
		cart.addAPlainUnitOf(cart.invoiceItems[0])

		const unit = cart.invoiceItems[1]
		expect(unit.is_stock_item).toBe(1)
		expect(shouldValidateItemStock(unit)).toBe(true)
	})

	it("treats an order that comes without the flag (an older server) as before", () => {
		const { is_stock_item: _unused, ...withoutFlag } = SERVICE
		cart.replaceAllItems([{ ...withoutFlag, posa_special_instructions: "no ice" }])
		expect(cart.invoiceItems[0].is_stock_item).toBeUndefined()

		cart.addAPlainUnitOf(cart.invoiceItems[0])
		expect(cart.invoiceItems[1].is_stock_item).toBe(1)
	})

	it("keeps the flag on a line opened the way the floor opens a table (addItem with the order's row)", () => {
		cart.addItem({ ...SERVICE }, 1)

		expect(cart.invoiceItems[0].is_stock_item).toBe(0)
	})
})

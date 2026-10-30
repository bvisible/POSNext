/**
 * //// Neoffice — added file (no upstream equivalent). The cart, the edit dialog and the invoice agree on the unit of a
 * //// line, whatever path added it (NeoRestau lot 1, task 22): a dish added from a restaurant card used to be a line
 * //// without a unit, so it never merged with the same dish added from the grid, a table's order read back from the
 * //// server was given « Nos » when its row named no unit, and the invoice carried whatever the line had.
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
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

const { usePOSCartStore } = await import("../posCart")
const { cardItemToCartItem } = await import("@/utils/cartLineUnits")

const WINE_ENTRY = {
	item_type: "Item",
	item: "vin",
	item_name: "Vin",
	price: 29,
	stock_uom: "Unité",
	item_uoms: [],
}
// The same wine, as the grid (get_items) hands it over
const WINE_IN_THE_GRID = {
	item_code: "vin",
	item_name: "Vin",
	rate: 29,
	price_list_rate: 29,
	uom: "Unité",
	stock_uom: "Unité",
	conversion_factor: 1,
	item_uoms: [],
}
const WATER_ENTRY = {
	item_type: "Item",
	item: "eau",
	item_name: "Eau",
	price: 4.5,
	stock_uom: "Bouteille",
	item_uoms: [{ uom: "Caisse", conversion_factor: 6 }],
}

describe("a cart line carries its real units, whatever added it", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
	})

	it("a card entry makes a line in the unit of the item, with the item's other units", () => {
		cart.addItem(cardItemToCartItem(WATER_ENTRY), 1)

		expect(cart.invoiceItems).toHaveLength(1)
		expect(cart.invoiceItems[0]).toMatchObject({
			item_code: "eau",
			uom: "Bouteille",
			stock_uom: "Bouteille",
			conversion_factor: 1,
			item_uoms: [{ uom: "Caisse", conversion_factor: 6 }],
		})
	})

	it("the same dish added from the card and from the grid is one line of two", () => {
		cart.addItem(cardItemToCartItem(WINE_ENTRY), 1)
		cart.addItem({ ...WINE_IN_THE_GRID }, 1)

		expect(cart.invoiceItems).toHaveLength(1)
		expect(cart.invoiceItems[0].quantity).toBe(2)
	})

	it("the invoice is written in the unit of the line", () => {
		cart.addItem(cardItemToCartItem(WATER_ENTRY), 1)

		const [row] = cart.formatItemsForSubmission(cart.invoiceItems)
		expect(row).toMatchObject({
			item_code: "eau",
			uom: "Bouteille",
			conversion_factor: 1,
		})
	})

	it("a line read back from a table's order keeps the unit its row names", () => {
		cart.addItem(
			{ item_code: "vin", item_name: "Vin", rate: 29, uom: "Unité" },
			2,
		)

		expect(cart.invoiceItems[0]).toMatchObject({
			uom: "Unité",
			stock_uom: "Unité",
		})
	})

	it("the lines reloaded from the server keep their units, and none is given « Nos »", () => {
		cart.replaceAllItems([
			{
				item_code: "vin",
				item_name: "Vin",
				qty: 2,
				rate: 29,
				uom: "Unité",
				stock_uom: "Unité",
				conversion_factor: 1,
				item_uoms: [],
			},
			{
				item_code: "eau",
				item_name: "Eau",
				qty: 1,
				rate: 4.5,
				uom: "Caisse",
				stock_uom: "Bouteille",
				conversion_factor: 6,
				item_uoms: [{ uom: "Caisse", conversion_factor: 6 }],
			},
			// A row that names no unit at all
			{ item_code: "pain", item_name: "Pain", qty: 1, rate: 3 },
		])

		const [wine, water, bread] = cart.invoiceItems
		expect(wine).toMatchObject({ uom: "Unité", stock_uom: "Unité" })
		expect(water).toMatchObject({
			uom: "Caisse",
			stock_uom: "Bouteille",
			conversion_factor: 6,
		})
		expect(water.item_uoms).toEqual([{ uom: "Caisse", conversion_factor: 6 }])
		expect(bread.uom).toBeUndefined()
		expect(cart.invoiceItems.map((line) => line.uom)).not.toContain("Nos")
	})
})

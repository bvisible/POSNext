/**
 * //// Neoffice — added file (no upstream equivalent). A table's order reloaded from the server (a guest's order at the
 * //// open table, replaceAllItems) carries each dish at the price the server holds, its options included. Saving the
 * //// options of such a line again must move its price by the change only, never take the options off twice
 * //// (NeoRestau lot 1, task 27, fix round 1: a dish at 40.50 with « no side −1.50 » fell to 39.00 when the waiter
 * //// added a remark).
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
const { modifiersPriceAdjustment } = await import("@/utils/modifiersPrice")

const options = (...chosen) =>
	JSON.stringify([{ group: "Side", options: chosen.map(([name, price_adjustment]) => ({ name, price_adjustment })) }])

describe("what the options of a line add to its price", () => {
	it("is the sum of every option of every group, the old « price » key included", () => {
		const modifiers = JSON.stringify([
			{ group: "Sauce", options: [{ name: "Pepper", price_adjustment: 2 }, { name: "Morels", price_adjustment: 6 }] },
			{ group: "Side", options: [{ name: "No side", price_adjustment: -1.5 }] },
			{ group: "Old", options: [{ name: "Cheese", price: 1 }] },
		])

		expect(modifiersPriceAdjustment(modifiers)).toBe(7.5)
		expect(modifiersPriceAdjustment(JSON.parse(modifiers))).toBe(7.5)
	})

	it("is nothing for no options, or options that cannot be read", () => {
		for (const none of [undefined, null, "", "[]", "not json", "{}", '[{"group":"Side"}]']) {
			expect(modifiersPriceAdjustment(none), String(none)).toBe(0)
		}
	})
})

describe("a line reloaded from the server", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
	})

	const reload = (rate, modifiers, qty = 1) =>
		cart.replaceAllItems([
			{ item_code: "STEAK", item_name: "Steak", rate, qty, uom: "Nos", posa_item_modifiers: modifiers, kds_status: "Pending" },
		])
	const save = (modifiers, adjustment) => cart.updateItemModifiers("STEAK", "Nos", modifiers, "no butter", adjustment, 0, 0)

	it("keeps its price when the same lowering is saved again with a remark", () => {
		reload(40.5, options(["No side", -1.5]))

		save(options(["No side", -1.5]), -1.5)

		expect(cart.invoiceItems[0].rate).toBe(40.5)
		expect(cart.invoiceItems[0].posa_special_instructions).toBe("no butter")
	})

	it("keeps its price when the same raise is saved again", () => {
		reload(44, options(["Pepper", 2]))

		save(options(["Pepper", 2]), 2)

		expect(cart.invoiceItems[0].rate).toBe(44)
	})

	it("moves by the difference only when the choice changes, for every portion", () => {
		reload(44, options(["Pepper", 2]), 3)

		save(options(["Morels", 6]), 6)

		expect(cart.invoiceItems[0].rate).toBe(48)
		expect(cart.invoiceItems[0].quantity).toBe(3)
		expect(cart.invoiceItems[0].amount).toBe(144)
	})

	it("comes back to the dish's own price when its options are taken off", () => {
		reload(40.5, options(["No side", -1.5]))

		save("[]", 0)

		expect(cart.invoiceItems[0].rate).toBe(42)
	})
})

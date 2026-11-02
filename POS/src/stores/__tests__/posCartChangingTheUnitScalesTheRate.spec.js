/**
 * //// Neoffice — added file (no upstream equivalent). Changing the unit of a line from its row in the cart scales its
 * //// rate when nobody priced the new unit (NeoResto lot 1, task 22, fix round 1). A dish added from a restaurant card
 * //// is priced by the card, not by the price list: for a unit the price list does not know, the server answers 0 (or
 * //// nothing, offline), and the cart took that for the new rate, or kept the rate of the first unit while the factor
 * //// (and the stock taken) grew with the new one. A price of the price list for the unit still wins.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? `${s} ${args.join(" ")}` : s)
	return { submit: vi.fn(), offline: { value: false }, cached: vi.fn() }
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: () => ({
		submit: mocks.submit,
		reload: vi.fn(),
		fetch: vi.fn(),
	}),
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
	isOffline: () => mocks.offline.value,
	getCachedItem: (...args) => mocks.cached(...args),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

const { usePOSCartStore } = await import("../posCart")
const { cardItemToCartItem } = await import("@/utils/cartLineUnits")

// The card says 4.50 for a kilo; the item is also sold by the box of ten kilos
const TOMATO_ENTRY = {
	item_type: "Item",
	item: "tomato",
	item_name: "Tomato",
	price: 4.5,
	stock_uom: "Kg",
	item_uoms: [{ uom: "Box", conversion_factor: 10 }],
}

describe("changing the unit of a line from the cart", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		mocks.submit.mockReset()
		mocks.cached.mockReset()
		mocks.offline.value = false
		cart.addItem(cardItemToCartItem(TOMATO_ENTRY), 1)
	})

	const line = () => cart.invoiceItems[0]

	it("scales the rate when the server has no price for the unit and answers 0", async () => {
		mocks.submit.mockResolvedValue({ price_list_rate: 0, rate: 0 })

		await cart.changeItemUOM("tomato", "Box", "Kg")

		expect(line()).toMatchObject({
			uom: "Box",
			conversion_factor: 10,
			rate: 45,
			price_list_rate: 45,
		})
	})

	it("scales it back when the unit goes back to the first", async () => {
		mocks.submit.mockResolvedValue({ price_list_rate: 0, rate: 0 })
		await cart.changeItemUOM("tomato", "Box", "Kg")

		await cart.changeItemUOM("tomato", "Kg", "Box")

		expect(line()).toMatchObject({ uom: "Kg", conversion_factor: 1, rate: 4.5 })
	})

	it("takes the price of the price list when the server has one for the unit", async () => {
		mocks.submit.mockResolvedValue({ price_list_rate: 40, rate: 40 })

		await cart.changeItemUOM("tomato", "Box", "Kg")

		expect(line()).toMatchObject({ uom: "Box", rate: 40, price_list_rate: 40 })
	})

	it("scales it when the till is offline and keeps no copy of the item", async () => {
		mocks.offline.value = true
		mocks.cached.mockResolvedValue(undefined)

		await cart.changeItemUOM("tomato", "Box", "Kg")

		expect(line()).toMatchObject({
			uom: "Box",
			conversion_factor: 10,
			rate: 45,
		})
	})

	it("scales it when the server cannot be reached and the till keeps no copy of the item", async () => {
		mocks.submit.mockRejectedValue(new Error("no network"))
		mocks.cached.mockResolvedValue(undefined)

		await cart.changeItemUOM("tomato", "Box", "Kg")

		expect(line()).toMatchObject({
			uom: "Box",
			conversion_factor: 10,
			rate: 45,
		})
	})

	it("offline, a copy of the item the till keeps gives the price of its unit as it always did", async () => {
		mocks.offline.value = true
		mocks.cached.mockResolvedValue({
			item_code: "tomato",
			price_list_rate: 4,
			conversion_factor: 1,
		})

		await cart.changeItemUOM("tomato", "Box", "Kg")

		expect(line()).toMatchObject({ uom: "Box", rate: 40 })
	})

	it("a rate typed by hand keeps its own rule: scaled, the price list is not asked", async () => {
		line().is_rate_manually_edited = 1
		line().rate = 5

		await cart.changeItemUOM("tomato", "Box", "Kg")

		expect(line()).toMatchObject({ uom: "Box", rate: 50 })
		expect(mocks.submit).not.toHaveBeenCalled()
	})
})

/**
 * //// Neoffice — added file (no upstream equivalent). The till takes over the cart of a customer's phone (useShopCart):
 * //// only a cart code, only where the till takes phones' carts, never over a cart in progress; the lines at their list
 * //// price (the till's offers are its own), the phone's draft as the till's, and the seller told when the amounts differ.
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { reactive } from "vue"

vi.hoisted(() => {
	globalThis.__ = (s, args) => s.replace(/{(\d+)}/g, (_, n) => args?.[n] ?? _)
})

const stores = vi.hoisted(() => ({
	cart: null,
	settings: null,
	shift: null,
	call: null,
	toast: null,
}))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => stores.cart }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => stores.settings,
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => stores.shift }))
vi.mock("@/utils/apiWrapper", () => ({
	call: (...args) => stores.call(...args),
}))
vi.mock("@/composables/useToast", () => ({ useToast: () => stores.toast }))

const { linesForTheTill, looksLikeCartCode, useShopCart } = await import(
	"../useShopCart"
)

const CART = {
	invoice: "FA-2026-00001",
	code: "K7Q-24M",
	customer: "CUST-1",
	customer_name: "A customer",
	grand_total: 18,
	needs_validation: false,
	items: [
		{
			item_code: "TEA",
			item_name: "Tea",
			qty: 2,
			price_list_rate: 10,
			rate: 9,
			uom: "Nos",
			stock_uom: "Nos",
			conversion_factor: 1,
		},
		{
			item_code: "SPOON",
			item_name: "Spoon",
			qty: 1,
			price_list_rate: 3,
			rate: 0,
			is_free_item: 1,
		},
	],
}

function lay({ enabled = 1, inTheCart = [], tillAmount = 18 } = {}) {
	stores.cart = reactive({
		invoiceItems: [...inTheCart],
		isProcessingOffers: false,
		grandTotal: tillAmount,
		clearCart: vi.fn(async () => {}),
		addItem: vi.fn((item, qty) =>
			stores.cart.invoiceItems.push({ ...item, qty }),
		),
		setCustomer: vi.fn(async () => {}),
		$patch: vi.fn((values) => Object.assign(stores.cart, values)),
	})
	stores.settings = { settings: { enable_shop_scan: enabled } }
	stores.shift = { profileName: "Shop till", profileCurrency: "CHF" }
	stores.call = vi.fn(async () => structuredClone(CART))
	stores.toast = { showSuccess: vi.fn(), showWarning: vi.fn() }
}

describe("a phone's cart at the till", () => {
	beforeEach(() => lay())

	it("knows a cart's code, with or without its dash, and nothing else", () => {
		expect(looksLikeCartCode("K7Q-24M")).toBe(true)
		expect(looksLikeCartCode(" k7q24m ")).toBe(true)
		expect(looksLikeCartCode("7612345678900")).toBe(false)
		expect(looksLikeCartCode("K0Q-24M")).toBe(false)
		expect(looksLikeCartCode("")).toBe(false)
	})

	it("gives the till the paid lines at their list price, never the free ones", () => {
		expect(linesForTheTill(CART)).toEqual([
			{
				item: {
					item_code: "TEA",
					item_name: "Tea",
					rate: 10,
					uom: "Nos",
					stock_uom: "Nos",
					conversion_factor: 1,
					image: undefined,
				},
				qty: 2,
			},
		])
	})

	it("takes the cart over as the till's own: its lines, its draft, its customer", async () => {
		const handled = await useShopCart().takeOver("K7Q-24M")

		expect(handled).toBe(true)
		expect(stores.call).toHaveBeenCalledWith(
			"pos_next.api.shop_scan.open_shop_cart",
			{
				code: "K7Q-24M",
				pos_profile: "Shop till",
			},
		)
		expect(stores.cart.addItem).toHaveBeenCalledTimes(1)
		expect(stores.cart.shopCartInvoice).toBe("FA-2026-00001")
		expect(stores.cart.currentDraftId).toBeUndefined()
		expect(stores.cart.setCustomer).toHaveBeenCalledWith({
			name: "CUST-1",
			customer_name: "A customer",
		})
		expect(stores.toast.showSuccess).toHaveBeenCalled()
	})

	it("asks nothing of the server where the till takes no phone's cart, or for an article's barcode", async () => {
		expect(await useShopCart().takeOver("7612345678900")).toBe(false)
		lay({ enabled: 0 })
		expect(await useShopCart().takeOver("K7Q-24M")).toBe(false)
		expect(stores.call).not.toHaveBeenCalled()
	})

	it("lets the article lookup run when the server knows no such cart", async () => {
		stores.call = vi.fn(async () => null)

		expect(await useShopCart().takeOver("K7Q-24M")).toBe(false)
		expect(stores.cart.addItem).not.toHaveBeenCalled()
	})

	it("never takes a cart over the one in progress", async () => {
		lay({ inTheCart: [{ item_code: "OTHER", qty: 1 }] })

		expect(await useShopCart().takeOver("K7Q-24M")).toBe(true)
		expect(stores.cart.clearCart).not.toHaveBeenCalled()
		expect(stores.toast.showWarning).toHaveBeenCalledWith(
			"Empty the cart before taking over the cart of a phone.",
		)
	})

	it("tells the seller when the till does not come to the phone's amount", async () => {
		lay({ tillAmount: 20 })

		await useShopCart().takeOver("K7Q-24M")

		await vi.waitFor(() => expect(stores.toast.showWarning).toHaveBeenCalled())
		expect(stores.toast.showWarning.mock.calls[0][0]).toContain(
			"an offer changed",
		)
	})

	it("says nothing more when the amounts are the same", async () => {
		await useShopCart().takeOver("K7Q-24M")
		await new Promise((resolve) => setTimeout(resolve, 20))

		expect(stores.toast.showWarning).not.toHaveBeenCalled()
	})
})

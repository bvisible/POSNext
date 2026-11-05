/**
 * //// Neoffice — added file (no upstream equivalent). The cart knows how many people are seated at its table (NeoResto lot 1, covers): a whole number from 1 to 99 or none, reset with the cart so that the next table starts with
 * //// none, and carried by BOTH payloads that save the order — the one of every « Valider » (`buildOfferEvaluationPayload`, sent to update_invoice) and the one of the payment (`submitInvoice`, sent to submit_invoice) —
 * //// under the key `restaurant_covers`, which is left out altogether when no number is set (never an invalid value).
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
	// Records what each endpoint is sent; the two invoice endpoints answer with the invoice's name
	createResource: (options) => {
		const url = options?.url ?? ""
		const submit = vi.fn(async (params) => {
			server.sent.push({ url, params })
			if (url.endsWith("update_invoice") || url.endsWith("submit_invoice"))
				return { name: "SINV-0001" }
			return {
				items: [],
				free_items: [],
				applied_pricing_rules: [],
				discount_amount: 0,
			}
		})
		return { submit, reload: vi.fn(), fetch: vi.fn() }
	},
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

const burger = {
	item_code: "BURGER",
	item_name: "Burger",
	rate: 20,
	price_list_rate: 20,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
}
const PROFILE = {
	company: "Resto",
	currency: "CHF",
	selling_price_list: "Standard",
	customer: "Walk-in",
}

// What the last submit_invoice call was asked to book
const submitted = () =>
	server.sent.filter((call) => call.url.endsWith("submit_invoice")).at(-1)
		.params.invoice

let cart
beforeEach(() => {
	server.sent = []
	setActivePinia(createPinia())
	cart = usePOSCartStore()
})

describe("the people seated at the table, in the cart", () => {
	it("are unset on a new cart", () => {
		expect(cart.restaurantCovers).toBeNull()
		expect(cart.coversAsk).toBeNull()
	})

	it("are set to a whole number from 1 to 99", () => {
		cart.setRestaurantCovers(3)
		expect(cart.restaurantCovers).toBe(3)

		cart.setRestaurantCovers(99)
		expect(cart.restaurantCovers).toBe(99)
	})

	it("take a number written as text", () => {
		cart.setRestaurantCovers("4")

		expect(cart.restaurantCovers).toBe(4)
	})

	it("store anything that is no number of people as none", () => {
		for (const value of [0, -1, 100, 2.5, "x", "", undefined, null]) {
			cart.setRestaurantCovers(3)
			cart.setRestaurantCovers(value)
			expect(cart.restaurantCovers, String(value)).toBeNull()
		}
	})

	it("are reset with the cart, and so is the question about them: the next table starts with none", async () => {
		cart.setRestaurantTable({ name: "T3" })
		cart.setRestaurantCovers(4)
		cart.coversAsk = "open"

		await cart.clearCart()

		expect(cart.restaurantCovers).toBeNull()
		expect(cart.coversAsk).toBeNull()
		expect(cart.restaurantTable).toBeNull()
	})

	it("are reset after a paid ticket, so that the next counter sale carries none", async () => {
		cart.setRestaurantTable({ name: "T3" })
		cart.setRestaurantCovers(2)
		cart.addItem({ ...burger })
		cart.customer = "CUST-1"
		await cart.submitInvoice()
		expect(submitted().restaurant_covers).toBe(2)

		await cart.clearCart({ returnSerials: false })
		cart.addItem({ ...burger })
		cart.customer = "CUST-2"
		await cart.submitInvoice()

		expect(submitted()).not.toHaveProperty("restaurant_covers")
	})
})

describe("the payload of every « Valider » (buildOfferEvaluationPayload, sent to update_invoice)", () => {
	it("carries the covers when a number is set", () => {
		cart.setRestaurantTable({ name: "T3" })
		cart.setRestaurantCovers(3)
		cart.addItem({ ...burger })

		const payload = cart.buildOfferEvaluationPayload(PROFILE)

		expect(payload.restaurant_covers).toBe(3)
		expect(payload.restaurant_table).toBe("T3")
	})

	it("leaves the key out when no number is set", () => {
		cart.setRestaurantTable({ name: "T3" })
		cart.addItem({ ...burger })

		const payload = cart.buildOfferEvaluationPayload(PROFILE)

		expect(payload).not.toHaveProperty("restaurant_covers")
	})

	it("leaves the key out after the number was taken back", () => {
		cart.setRestaurantTable({ name: "T3" })
		cart.setRestaurantCovers(3)
		cart.setRestaurantCovers(null)
		cart.addItem({ ...burger })

		expect(cart.buildOfferEvaluationPayload(PROFILE)).not.toHaveProperty(
			"restaurant_covers",
		)
	})

	it("carries the covers in the payload of a send that decides nothing for the kitchen too", () => {
		cart.setRestaurantCovers(5)
		cart.addItem({ ...burger })

		expect(
			cart.buildOfferEvaluationPayload(PROFILE, { keepUndecided: true })
				.restaurant_covers,
		).toBe(5)
	})
})

describe("the payload of the payment (submitInvoice, sent to submit_invoice)", () => {
	it("carries the covers when a number is set", async () => {
		cart.setRestaurantTable({ name: "T3" })
		cart.setRestaurantCovers(4)
		cart.addItem({ ...burger })
		cart.customer = "CUST-1"

		await cart.submitInvoice()

		expect(submitted().restaurant_covers).toBe(4)
		expect(submitted().restaurant_table).toBe("T3")
	})

	it("leaves the key out when no number is set", async () => {
		cart.setRestaurantTable({ name: "T3" })
		cart.addItem({ ...burger })
		cart.customer = "CUST-1"

		await cart.submitInvoice()

		expect(submitted()).not.toHaveProperty("restaurant_covers")
	})

	it("leaves the key out for a number the setter refused", async () => {
		cart.setRestaurantCovers(250)
		cart.addItem({ ...burger })
		cart.customer = "CUST-1"

		await cart.submitInvoice()

		expect(submitted()).not.toHaveProperty("restaurant_covers")
	})
})

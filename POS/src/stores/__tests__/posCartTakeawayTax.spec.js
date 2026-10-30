/**
 * //// Neoffice — added file (no upstream equivalent). A takeaway order at the till (NeoRestau lot 1, task 11): the
 * //// cart is taxed at the takeaway rates while it is one, and its payment carries the takeaway flag and the order's
 * //// number to the server, which then gives the invoice the restaurant's takeaway tax category. The draft the till
 * //// saves just before the payment never carries them: a takeaway draft is a kitchen ticket to the kitchen screen and
 * //// the takeaway counter, and the payment's draft would show there as a second order.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? `${s} ${args.join(" ")}` : s)
	return {
		sent: [],
		// The till's tax rows: the Swiss layout item by item, one row per VAT account at 0, the tax in the price
		taxes: [
			{ account_head: "VAT 8.1", charge_type: "On Net Total", rate: 0, included_in_print_rate: 1 },
			{ account_head: "VAT 2.6", charge_type: "On Net Total", rate: 0, included_in_print_rate: 1 },
		],
	}
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	// Records what each endpoint is sent. The two invoice endpoints answer with the invoice's name, the till's taxes
	// with its rows, every other one (offers, draft cleanup) with an empty but well-formed result.
	createResource: (options) => {
		const url = options?.url ?? ""
		const submit = vi.fn(async (params) => {
			server.sent.push({ url, params })
			if (url.endsWith("update_invoice") || url.endsWith("submit_invoice")) {
				return { name: "SINV-0001" }
			}
			if (url.endsWith("get_taxes")) return server.taxes
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

// A dish, as the server sends it: its VAT map on site (8.1 %) and to take away (2.6 %)
const pasta = {
	item_code: "PASTA",
	item_name: "Pasta",
	rate: 10.81,
	price_list_rate: 10.81,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
	item_tax_rate: JSON.stringify({ "VAT 8.1": 8.1, "VAT 2.6": 0 }),
	takeaway_item_tax_rate: JSON.stringify({ "VAT 8.1": 0, "VAT 2.6": 2.6 }),
}

// What the last call to an invoice endpoint was asked to save
const lastSent = (endpoint) => server.sent.filter((call) => call.url.endsWith(endpoint)).at(-1).params

describe("a takeaway order at the till", () => {
	let cart
	beforeEach(async () => {
		server.sent = []
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		await cart.loadTaxRules("TILL", { tax_inclusive: 1 })
	})

	it("is paid with the takeaway flag and its number, and its draft is saved without them", async () => {
		// What the floor plan's takeaway button does (POSSale.vue, handleStartTakeaway)
		cart.$patch({ isTakeaway: true, takeawayNumber: "T-007" })
		cart.addItem({ ...pasta })
		cart.customer = "CUST-1"
		await cart.submitInvoice()

		const draft = lastSent("update_invoice").data
		expect(draft).not.toHaveProperty("is_takeaway")
		expect(draft).not.toHaveProperty("takeaway_number")
		const paid = lastSent("submit_invoice").invoice
		expect(paid.is_takeaway).toBe(1)
		expect(paid.takeaway_number).toBe("T-007")
	})

	it("leaves a sale on site without the takeaway flag", async () => {
		cart.addItem({ ...pasta })
		cart.customer = "CUST-1"
		await cart.submitInvoice()
		expect(lastSent("submit_invoice").invoice).not.toHaveProperty("is_takeaway")
	})

	it("is taxed at the takeaway rates while it is one, and the next order is back on site", async () => {
		cart.addItem({ ...pasta })
		expect(cart.totalTax).toBe(0.81)
		cart.$patch({ isTakeaway: true, takeawayNumber: "T-008" })
		// The price includes the tax: 10.81 holds 0.27 of VAT at 2.6 %
		expect(cart.totalTax).toBe(0.27)
		expect(cart.grandTotal).toBe(10.81)

		await cart.clearCart({ returnSerials: false })
		expect(cart.isTakeaway).toBe(false)
		cart.addItem({ ...pasta })
		expect(cart.totalTax).toBe(0.81)
	})

	it("hands the takeaway flag and number to a sale saved offline", () => {
		expect(cart.takeawaySaleFields()).toEqual({})
		cart.$patch({ isTakeaway: true, takeawayNumber: "T-009" })
		expect(cart.takeawaySaleFields()).toEqual({ is_takeaway: 1, takeaway_number: "T-009" })
	})
})

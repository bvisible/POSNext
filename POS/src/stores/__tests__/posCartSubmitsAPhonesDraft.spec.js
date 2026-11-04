/**
 * //// Neoffice — added file (no upstream equivalent). Scanning in the shop (lot 3): a phone's cart the till took over is
 * //// already a draft on the server, and the till's sale is that draft. Without its name in the sale, the till booked a
 * //// second invoice and left the phone's draft behind (seen on the screen, 04.11). The next ticket is no phone's draft.
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
			if (url.endsWith("update_invoice") || url.endsWith("submit_invoice")) {
				return { name: params?.data?.name || "SINV-NEW" }
			}
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

const tea = {
	item_code: "TEA",
	item_name: "Tea",
	rate: 10,
	price_list_rate: 10,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
}

// The name the last sale was saved under (update_invoice), and the invoice it then submitted
const saved = () =>
	server.sent.filter((call) => call.url.endsWith("update_invoice")).at(-1)
		.params.data.name
const submitted = () =>
	server.sent.filter((call) => call.url.endsWith("submit_invoice")).at(-1)
		.params.invoice.name

describe("the sale of a phone's cart", () => {
	let cart
	beforeEach(() => {
		server.sent = []
		setActivePinia(createPinia())
		cart = usePOSCartStore()
	})

	it("is the phone's draft, saved and submitted by its name", async () => {
		cart.$patch({ shopCartInvoice: "FA-2026-00001" })
		cart.addItem({ ...tea }, 2)
		cart.customer = "CUST-1"
		await cart.submitInvoice()

		expect(saved()).toBe("FA-2026-00001")
		expect(submitted()).toBe("FA-2026-00001")
	})

	it("leaves the next ticket a new invoice", async () => {
		cart.$patch({ shopCartInvoice: "FA-2026-00001" })
		await cart.clearCart({ returnSerials: false })
		cart.addItem({ ...tea })
		cart.customer = "CUST-2"
		await cart.submitInvoice()

		expect(cart.shopCartInvoice).toBeNull()
		expect(saved()).toBeUndefined()
	})

	it("names no draft for a sale made at the till", async () => {
		cart.addItem({ ...tea })
		cart.customer = "CUST-1"
		await cart.submitInvoice()

		expect(saved()).toBeUndefined()
		expect(submitted()).toBe("SINV-NEW")
	})
})

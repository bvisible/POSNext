/**
 * //// Neoffice — added file (no upstream equivalent). A takeaway ticket paid straight from the cart (neoffice-maintenance#1972): paying first sends
 * //// what the kitchen has not got to the kitchen, which makes the ticket's draft. A takeaway ticket has no table to find that draft by, so the
 * //// payment saved a SECOND draft and submitted that one, and the first stayed as a ghost ticket in the kitchen and on the takeaway counter. The
 * //// payment now settles the draft the kitchen was told about, and only for a takeaway ticket (a table finds its draft by its table, a retail
 * //// ticket's draft id is a local one).
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
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

const DRAFT = "ACC-SINV-0001"

// The name the last sale was saved under (update_invoice), and the invoice it then submitted
const saved = () => server.sent.filter((call) => call.url.endsWith("update_invoice")).at(-1).params.data.name
const submitted = () => server.sent.filter((call) => call.url.endsWith("submit_invoice")).at(-1).params.invoice

async function pay(cart) {
	cart.addItem({ ...tea }, 1)
	cart.customer = "CUST-1"
	await cart.submitInvoice()
}

describe("paying a takeaway ticket straight from the cart", () => {
	let cart
	beforeEach(() => {
		server.sent = []
		setActivePinia(createPinia())
		cart = usePOSCartStore()
	})

	it("settles the draft the kitchen was told about, not a second one", async () => {
		cart.$patch({ isTakeaway: true, takeawayNumber: "T-001", currentDraftId: DRAFT })

		await pay(cart)

		expect(saved()).toBe(DRAFT)
		expect(submitted().name).toBe(DRAFT)
	})

	it("still carries the flag and the number of the takeaway order to the payment", async () => {
		cart.$patch({ isTakeaway: true, takeawayNumber: "T-001", currentDraftId: DRAFT })

		await pay(cart)

		expect(submitted()).toMatchObject({ is_takeaway: 1, takeaway_number: "T-001" })
	})

	it("is a new invoice when the ticket has no draft (nothing was sent to the kitchen)", async () => {
		cart.$patch({ isTakeaway: true, takeawayNumber: "T-001" })

		await pay(cart)

		expect(saved()).toBeUndefined()
		expect(submitted().name).toBe("SINV-NEW")
	})

	it("leaves the next ticket no draft of the last one", async () => {
		cart.$patch({ isTakeaway: true, takeawayNumber: "T-001", currentDraftId: DRAFT })
		await pay(cart)

		await cart.clearCart({ returnSerials: false })
		await pay(cart)

		expect(cart.shopCartInvoice).toBeNull()
		expect(saved()).toBeUndefined()
	})

	it("is the phone's draft when the ticket is one (the phone's cart is not overridden)", async () => {
		cart.$patch({ isTakeaway: true, takeawayNumber: "T-001", currentDraftId: DRAFT, shopCartInvoice: "FA-2026-00001" })

		await pay(cart)

		expect(saved()).toBe("FA-2026-00001")
	})
})

describe("paying a ticket that is not a takeaway ticket", () => {
	let cart
	beforeEach(() => {
		server.sent = []
		setActivePinia(createPinia())
		cart = usePOSCartStore()
	})

	it("names no draft for a table: the server finds it by the table", async () => {
		cart.setRestaurantTable({ name: "T5" })
		cart.$patch({ currentDraftId: DRAFT })

		await pay(cart)

		expect(saved()).toBeUndefined()
	})

	it("names no draft for a retail ticket, whose draft id is a local one", async () => {
		cart.$patch({ currentDraftId: "draft_1699999999" })

		await pay(cart)

		expect(saved()).toBeUndefined()
	})
})

describe("the page that sends the unsent lines to the kitchen when paying", () => {
	// The page is too large to mount: its source is read, as the other specs of the till do for it
	const page = readFileSync(
		resolve(dirname(fileURLToPath(import.meta.url)), "../../pages/POSSale.vue"),
		"utf8",
	)

	it("keeps the draft that the kitchen send answers, as the Validate button does", () => {
		const autoSend = page.slice(page.indexOf("Auto-send unsent items to kitchen before payment"))
		expect(autoSend).toMatch(/const sent = await call\("pos_next\.api\.invoices\.update_invoice"/)
		expect(autoSend.slice(0, 3500)).toMatch(/currentDraftId: sent\.name/)
	})
})

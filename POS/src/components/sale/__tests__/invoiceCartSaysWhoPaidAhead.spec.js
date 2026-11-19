/**
 * //// Neoffice — added file (no upstream equivalent). What the cart says of the money already received (NeoSalon, voie 4, 19.11.2026): a table's guests pay their own
 * //// share from their phone (« Already paid (guest) »), but what a salon's customer paid ahead on the booking page is not a guest's share: the cart of an appointment says
 * //// « Already paid online » (the tester read « Already paid (guest) » on a haircut). The cart is mounted for real, with the store of the sale page.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
	// jsdom has no CSS.escape, which the cart calls to scroll to the line it flashes
	globalThis.CSS = { ...globalThis.CSS, escape: (value) => value }
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
	FeatherIcon: { template: "<i />" },
	Button: { template: "<button><slot /></button>" },
	Dialog: {
		template: "<div><slot name='body-content' /><slot name='actions' /></div>",
	},
}))
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: new Proxy({}, { get: () => vi.fn(async () => null) }),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showWarning: vi.fn(),
		showInfo: vi.fn(),
	}),
}))
// A salon's till: no kitchen
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({
		shouldEnforceStockValidation: () => false,
		settings: { enable_restaurant_mode: 0 },
	}),
}))

const { usePOSCartStore } = await import("@/stores/posCart")
const { default: InvoiceCart } = await import("../InvoiceCart.vue")

describe("what the cart says of the money already received", () => {
	let cart
	let wrapper
	beforeEach(() => {
		setActivePinia(createPinia())
		window.localStorage.clear()
		cart = usePOSCartStore()
		cart.addItem({
			item_code: "CUT",
			item_name: "Cut",
			item_group: "Services",
			rate: 70,
			price_list_rate: 70,
			uom: "Unit",
			stock_uom: "Unit",
			conversion_factor: 1,
			item_uoms: [],
			is_stock_item: 0,
		})
		cart.guestPaidAmount = 30
	})
	afterEach(() => wrapper?.unmount())

	const mountCart = () => {
		wrapper = mount(InvoiceCart, {
			attachTo: document.body,
			props: { items: cart.invoiceItems },
			global: { mocks: { __: globalThis.__ }, stubs: { EditItemDialog: true } },
		})
		return wrapper
	}

	it("says « Already paid online » on the cart of an appointment, whose money came from the booking page", () => {
		cart.appointment = { booking: "BKG-1", invoice: "SINV-1", customer_name: "Anna", starts_at: "2026-11-19 10:00:00" }
		mountCart()

		const text = wrapper.text()
		expect(text).toContain("Already paid online")
		expect(text).not.toContain("Already paid (guest)")
	})

	it("keeps « Already paid (guest) » for the cart of a table, whose guests pay their own share", () => {
		mountCart()

		const text = wrapper.text()
		expect(text).toContain("Already paid (guest)")
		expect(text).not.toContain("Already paid online")
	})

	it("says nothing of money already received when nothing was", () => {
		cart.guestPaidAmount = 0
		cart.appointment = { booking: "BKG-1", invoice: "SINV-1", customer_name: "Anna", starts_at: "2026-11-19 10:00:00" }
		mountCart()

		expect(wrapper.text()).not.toContain("Already paid")
	})
})

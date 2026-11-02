/**
 * //// Neoffice — added file (no upstream equivalent). The cart's header names the customer of the table's order, whatever shape it comes in (NeoResto lot 1,
 * //// Daniel, 02.11.2026): an order that comes back from the server carries its customer as a name, a string, and a guest who signed in on the QR page is the
 * //// customer of the table. The header read `customer.customer_name || customer.name`, which is nothing for a string, so the waiter saw a customer with no name.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? String(s).replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
})

const offered = vi.hoisted(() => ({
	canOffer: true,
	offer: vi.fn(),
	cancelOffer: vi.fn(),
}))

vi.mock("frappe-ui", () => ({
	FeatherIcon: { props: ["name"], template: "<i :data-icon='name' />" },
	createResource: () => ({
		submit: vi.fn(),
		fetch: vi.fn(),
		reload: vi.fn(),
		data: null,
	}),
}))
vi.mock("@/stores/offeredItems", () => ({
	useOfferedItemsStore: () => offered,
}))
vi.mock("@/stores/posCart", () => ({
	usePOSCartStore: () => ({
		restaurantTable: { name: "T2", table_name: "Table 2" },
		isTakeaway: false,
		invoiceItems: [],
		targetDoctype: "Sales Invoice",
		appliedCoupon: null,
		guestPaidAmount: 0,
		guestTipAmount: 0,
		taxInclusive: true,
		updateItemDetails: vi.fn(),
	}),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({
		cartLifo: true,
		allowSalesOrder: false,
		allowItemDiscount: true,
	}),
}))
vi.mock("@/stores/posOffers", () => ({
	usePOSOffersStore: () => ({
		ensureOffersFetched: vi.fn(),
		availableOffers: [],
	}),
}))
vi.mock("@/stores/customerSearch", () => ({
	useCustomerSearchStore: () => ({
		allCustomers: [],
		frequentCustomers: [],
		loadAllCustomers: vi.fn(),
		loadCustomerHistory: vi.fn(),
		trackCustomerSelection: vi.fn(),
	}),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({
		isEnabled: true,
		stationItemsMap: {},
		stationLabel: (s) => s,
	}),
}))
vi.mock("@/stores/itemSearch", () => ({
	useItemSearchStore: () => ({ allItems: [] }),
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => false }))
vi.mock("@/utils/offline/workerClient", () => ({ offlineWorker: {} }))

const { default: InvoiceCart } = await import("../InvoiceCart.vue")

function mountCart(customer) {
	return mount(InvoiceCart, {
		props: { items: [], customer, currency: "CHF", grandTotal: 0, subtotal: 0 },
		global: {
			mocks: { __: globalThis.__ },
			stubs: { EditItemDialog: { props: ["canOffer", "item", "modelValue"], template: "<div />" } },
		},
	})
}

describe("the cart's header", () => {
	it("names a customer that comes back from the server as a name", () => {
		const wrapper = mountCart("Marie Dupont")

		expect(wrapper.text()).toContain("Marie Dupont")
	})

	it("names a customer the till picked itself, an object", () => {
		const wrapper = mountCart({ name: "CUST-1", customer_name: "Paul Durand", mobile_no: "079 000 00 00" })

		expect(wrapper.text()).toContain("Paul Durand")
		expect(wrapper.text()).not.toContain("CUST-1")
	})

	it("falls back to the document name of an object that has no customer name", () => {
		const wrapper = mountCart({ name: "CUST-2" })

		expect(wrapper.text()).toContain("CUST-2")
	})
})

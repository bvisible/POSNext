/**
 * //// Neoffice — added file (no upstream equivalent). The table's order shows the kitchen's state on a line, except for a station that works on paper alone
 * //// (NeoResto lot 1, Daniel, 02.11.2026: « on n'a plus cette notion du tout affichée sur les tables »): its cooks read a ticket, nobody marks a state on a
 * //// screen, so « pending » would show for ever. A course the waiter holds back is the waiter's own and shows as ever.
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
	createResource: () => ({ submit: vi.fn(), fetch: vi.fn(), reload: vi.fn(), data: null }),
}))
vi.mock("@/stores/offeredItems", () => ({ useOfferedItemsStore: () => offered }))
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
	usePOSSettingsStore: () => ({ cartLifo: true, allowSalesOrder: false, allowItemDiscount: true }),
}))
vi.mock("@/stores/posOffers", () => ({
	usePOSOffersStore: () => ({ ensureOffersFetched: vi.fn(), availableOffers: [] }),
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
		isPaperOnly: (station) => station === "Kitchen",
	}),
}))
vi.mock("@/stores/itemSearch", () => ({ useItemSearchStore: () => ({ allItems: [] }) }))
vi.mock("@/utils/offline", () => ({ isOffline: () => false }))
vi.mock("@/utils/offline/workerClient", () => ({ offlineWorker: {} }))

const { default: InvoiceCart } = await import("../InvoiceCart.vue")

const line = (name, station, status) => ({
	item_code: name,
	item_name: name,
	quantity: 1,
	qty: 1,
	rate: 10,
	amount: 10,
	uom: "Nos",
	preparation_station: station,
	kds_status: status,
})

function mountCart(items) {
	return mount(InvoiceCart, {
		props: { items, customer: null, currency: "CHF", grandTotal: 10 * items.length, subtotal: 10 * items.length },
		global: {
			mocks: { __: globalThis.__ },
			stubs: { EditItemDialog: { props: ["canOffer", "item", "modelValue"], template: "<div />" } },
		},
	})
}

describe("the kitchen state of a line at the table", () => {
	it("is shown for a station with a screen", () => {
		const wrapper = mountCart([line("Wine", "Bar", "Preparing")])

		expect(wrapper.text()).toContain("Preparing")
	})

	it("is not shown for a station that works on paper alone", () => {
		const wrapper = mountCart([line("Steak", "Kitchen", "Pending")])

		expect(wrapper.text()).toContain("Steak")
		expect(wrapper.text()).not.toContain("Pending")
	})

	it("still shows a course the waiter holds back at a paper-only station", () => {
		const wrapper = mountCart([line("Tart", "Kitchen", "Waiting")])

		expect(wrapper.text()).toContain("Waiting")
	})
})

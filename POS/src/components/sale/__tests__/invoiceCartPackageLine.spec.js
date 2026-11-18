/**
 * //// Neoffice — added file (no upstream equivalent). The cart shows a line a package of sessions pays (NeoSalon lots G11, voie 4: the audit of 18.11): the words of the package
 * //// (« Settled by the package · 1 session »), its price struck through, 0.00 charged, and NOT the offers' « 100 % off · You save » that says what an offer gave: a session
 * //// is not a saving.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"
import { toRaw } from "vue"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? String(s).replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
})

const offered = vi.hoisted(() => ({
	canOffer: true,
	offer: vi.fn(),
	cancelOffer: vi.fn(),
}))

//// Neoffice — the cart reads the packages of its customer (NeoSalon lots G11, voie 1); this file is about something else, with no package: a double that offers none.
vi.mock("@/stores/customerPackages", () => ({
	covers: () => false,
	useCustomerPackagesStore: () => ({ usable: false, available: false, packages: [], load: vi.fn(), anyCovers: () => false }),
}))
vi.mock("@/components/sale/UsePackageDialog.vue", () => ({ default: { template: "<div />" } }))
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

const paidByPackage = (changes = {}) => ({
	item_code: "TIRAMISU",
	item_name: "Tiramisu",
	rate: 9.5,
	price_list_rate: 9.5,
	quantity: 1,
	amount: 0,
	discount_percentage: 100,
	discount_amount: 9.5,
	customer_package: "CPK-1",
	package_label: "Settled by the package · 1 session",
	uom: "Nos",
	stock_uom: "Nos",
	kds_status: "Pending",
	...changes,
})

function mountCart(items) {
	return mount(InvoiceCart, {
		props: { items, currency: "CHF", grandTotal: 0, subtotal: 9.5 },
		global: {
			mocks: { __: globalThis.__ },
			stubs: { EditItemDialog: { props: ["modelValue"], template: "<div class='edit-dialog' />" } },
		},
	})
}

describe("the cart and a line a package pays", () => {
	it("says the words of the package and keeps the offers' saving off it", () => {
		const wrapper = mountCart([paidByPackage()])

		expect(wrapper.get("[data-test='line-package']").text()).toBe("Settled by the package · 1 session")
		expect(wrapper.find("[data-cart-saving]").exists()).toBe(false)
		expect(wrapper.text()).not.toContain("You save")
		expect(wrapper.text()).not.toContain("100% off")
	})

	it("still says what an offer gave on a line no package pays", () => {
		const wrapper = mountCart([paidByPackage({ customer_package: null, package_label: null })])

		expect(wrapper.find("[data-cart-saving]").exists()).toBe(true)
		expect(wrapper.text()).toContain("You save")
	})
})

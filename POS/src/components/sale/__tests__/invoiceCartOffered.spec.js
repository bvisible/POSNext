/**
 * //// Neoffice — added file (no upstream equivalent). The cart shows an offered row (« Offert », NeoResto lot 1, task 24)
 * //// under its paid line: « Offert », 0.00 charged, its value struck through; « Annuler l'offert » hands the cart row
 * //// behind the copy shown back to the cart (cartRowOf, the pitfall « Le panier de la caisse »). A whole line offered
 * //// reads « Offert » on its own. The line dialog is told whether the line may be offered.
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
const { makeOfferedRow } = await import("@/utils/offeredRows")

const tiramisu = (changes = {}) => ({
	item_code: "TIRAMISU",
	item_name: "Tiramisu",
	rate: 9.5,
	price_list_rate: 9.5,
	quantity: 2,
	amount: 19,
	uom: "Nos",
	stock_uom: "Nos",
	kds_status: "Pending",
	...changes,
})

function mountCart(items) {
	return mount(InvoiceCart, {
		props: { items, currency: "CHF", grandTotal: 19, subtotal: 28.5 },
		global: {
			mocks: { __: globalThis.__ },
			stubs: {
				EditItemDialog: {
					props: ["canOffer", "item", "modelValue"],
					template: "<div class='edit-dialog' />",
				},
			},
		},
	})
}

describe("the cart and an offered row", () => {
	it("shows « Offert » under the paid line, 0.00 charged, the value struck through", () => {
		const paid = tiramisu()
		const gift = makeOfferedRow(tiramisu({ quantity: 3 }), 1)
		// The cart lists newest first: the offered row (made after the paid line) is still shown under it
		const wrapper = mountCart([paid, gift])
		const lines = wrapper.findAll("[data-line-key], [data-test='offered-line']")
		expect(
			lines.map((l) =>
				l.attributes("data-test") === "offered-line" ? "offered" : "paid",
			),
		).toEqual(["paid", "offered"])
		const shown = wrapper.find("[data-test='offered-line']")
		expect(shown.text()).toContain("Offered")
		expect(shown.text()).toContain("0.00")
		expect(shown.find(".line-through").text()).toContain("9.50")
		// Nested under its paid line
		expect(shown.classes()).toContain("ms-6")
	})

	it("« Annuler l'offert » hands the cart row behind the copy shown back to the cart", async () => {
		const paid = tiramisu()
		const gift = makeOfferedRow(tiramisu({ quantity: 3 }), 1)
		const wrapper = mountCart([paid, gift])
		await wrapper.find("[data-test='cancel-offer']").trigger("click")
		expect(offered.cancelOffer).toHaveBeenCalledTimes(1)
		// The row itself (the cart's rows are reactive: the same object behind its proxy), not the copy shown
		const handed = offered.cancelOffer.mock.calls[0][0]
		expect(toRaw(handed)).toBe(gift)
		expect(handed._offeredOf).toBeUndefined()
	})

	it("a whole line offered reads « Offert » on its own", () => {
		const wrapper = mountCart([makeOfferedRow(tiramisu({ quantity: 3 }), 3)])
		const shown = wrapper.find("[data-test='offered-line']")
		expect(shown.exists()).toBe(true)
		expect(shown.classes()).not.toContain("ms-6")
		expect(wrapper.findAll("[data-line-key]")).toHaveLength(0)
	})

	it("tells the line dialog that a sold line may be offered, and offers what it confirms on that cart row", async () => {
		const paid = tiramisu()
		const wrapper = mountCart([paid])
		await wrapper.find("[data-line-key]").trigger("click")
		const dialog = wrapper.findComponent(".edit-dialog")
		expect(dialog.props("canOffer")).toBe(true)
		await wrapper.vm.$.setupState.handleOfferItem({ quantity: 1 })
		expect(offered.offer).toHaveBeenCalledTimes(1)
		expect(toRaw(offered.offer.mock.calls[0][0])).toBe(paid)
		expect(offered.offer.mock.calls[0][1]).toBe(1)
	})
})

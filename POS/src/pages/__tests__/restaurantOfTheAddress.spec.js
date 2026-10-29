/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen screen and the takeaway counter are pages of
 * //// their own, opened in a tab from a till (NeoRestau lot 1, task 2): the tab has no till settings loaded, so the
 * //// restaurant whose orders it shows comes from its address. A kitchen bookmark made before a site could hold
 * //// several restaurants names a station alone, and the restaurant is then the station's.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	tillRestaurant: undefined,
	runnerEnabled: true,
	ofTheRestaurant() {
		return { restaurant: this.tillRestaurant }
	},
}))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurantStore }))
vi.mock("@/socket", () => ({ initSocket: () => null }))
vi.mock("@/utils/currency", () => ({ formatCurrencyNumber: (amount) => String(amount) }))

const { default: KDS } = await import("../KDS.vue")
const { default: Takeaway } = await import("../Takeaway.vue")

const KITCHEN = "pos_next.api.restaurant.get_preparation_stations"
const KDS_ORDERS = "pos_next.api.restaurant.get_kds_orders"
const TAKEAWAY_ORDERS = "pos_next.api.restaurant.get_takeaway_orders"

let opened = []
function open(path, search = "", answers = {}) {
	window.history.replaceState({}, "", `${path}${search}`)
	call.mockReset()
	call.mockImplementation(async (method) => (method in answers ? answers[method] : []))
	const wrapper = mount(
		{ KDS, Takeaway }[path === "/pos/kds" ? "KDS" : "Takeaway"],
		{ global: { stubs: { KDSOrderCard: true }, mocks: { __: globalThis.__ } } },
	)
	opened.push(wrapper)
	return wrapper
}

const askedOf = (method) => call.mock.calls.filter(([name]) => name === method).map(([, params]) => params)

beforeEach(() => {
	restaurantStore.tillRestaurant = undefined
	opened = []
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
})

describe("the kitchen screen works for one restaurant", () => {
	it("shows the restaurant named in its address", async () => {
		open("/pos/kds", "?restaurant=The%20Bar")
		await flushPromises()

		expect(askedOf(KITCHEN)).toEqual([{ restaurant: "The Bar" }])
		expect(askedOf(KDS_ORDERS).every((params) => params.restaurant === "The Bar")).toBe(true)
	})

	it("shows the restaurant of the till when its address names none", async () => {
		restaurantStore.tillRestaurant = "The Bistro"
		open("/pos/kds")
		await flushPromises()

		expect(askedOf(KITCHEN)).toEqual([{ restaurant: "The Bistro" }])
		expect(askedOf(KDS_ORDERS).every((params) => params.restaurant === "The Bistro")).toBe(true)
	})

	it("takes the restaurant of the station when a bookmark names a station alone", async () => {
		// The till on this tablet belongs to another restaurant than the station of the bookmark
		restaurantStore.tillRestaurant = "The Bistro"
		open("/pos/kds", "?station=h4sh0f4stn", {
			[KITCHEN]: [{ name: "h4sh0f4stn", station_name: "Bar", restaurant: "The Bar" }],
		})
		await flushPromises()

		expect(askedOf(KITCHEN)).toEqual([{ restaurant: undefined, station: "h4sh0f4stn" }])
		// Every read of the orders is the station's restaurant's, the count of all the orders as well
		const orders = askedOf(KDS_ORDERS)
		expect(orders.length).toBeGreaterThanOrEqual(2)
		expect(orders.map((params) => params.restaurant)).toEqual(orders.map(() => "The Bar"))
		expect(orders.some((params) => params.station === "h4sh0f4stn")).toBe(true)
	})

	it("keeps the restaurant of its address over the one of its station", async () => {
		open("/pos/kds", "?station=h4sh0f4stn&restaurant=The%20Bar", {
			[KITCHEN]: [{ name: "h4sh0f4stn", station_name: "Bar", restaurant: "The Bar" }],
		})
		await flushPromises()

		expect(askedOf(KITCHEN)).toEqual([{ restaurant: "The Bar", station: "h4sh0f4stn" }])
	})
})

describe("the takeaway counter works for one restaurant", () => {
	it("shows the orders of the restaurant named in its address", async () => {
		open("/pos/takeaway", "?restaurant=The%20Bar")
		await flushPromises()

		expect(askedOf(TAKEAWAY_ORDERS).map((params) => params.restaurant)).toEqual(["The Bar"])
	})

	it("shows the orders of the till's restaurant when its address names none", async () => {
		restaurantStore.tillRestaurant = "The Bistro"
		open("/pos/takeaway")
		await flushPromises()

		expect(askedOf(TAKEAWAY_ORDERS).map((params) => params.restaurant)).toEqual(["The Bistro"])
	})
})

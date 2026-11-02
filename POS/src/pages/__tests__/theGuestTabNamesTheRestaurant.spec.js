/**
 * //// Neoffice — added file (no upstream equivalent). The tab of a guest page carries the name of the restaurant
 * //// ("The Bistro · Neopos") instead of the bare word of the screen ("Order · Neopos"), from the first call of the session
 * //// (NeoResto lot 1, Ruling 52). The only name a page had was the company of an order, which exists only once there is an
 * //// invoice, and on a site that runs several restaurants under one company it told them apart no better. The server now
 * //// answers `restaurant_name` to `validate_token`, the call every guest session starts with (a takeaway session starts
 * //// with `create_takeaway_token` and validates its token right after); the store keeps it at `validateToken`, and the
 * //// pages feed the tab from it. The word of the screen ("Order") stays the fallback when the session names none.
 * ////
 * //// The pages are mounted as a diner meets them, over the real store, with the server answering through `fetch`.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const words = vi.hoisted(() => {
	const words = { catalogue: {} }
	globalThis.__ = (msgid) => words.catalogue[msgid] ?? msgid
	return words
})

vi.mock("vue-router", async (importOriginal) => ({
	...(await importOriginal()),
	useRoute: () => ({ params: { token: "tok-1" } }),
}))
// The menu, the cart and the checkout are not under test
vi.mock("@/components/guest/GuestMenuView.vue", () => ({
	default: { template: "<div />" },
}))
vi.mock("@/components/guest/GuestCart.vue", () => ({
	default: { template: "<div />" },
}))
vi.mock("@/components/guest/GuestCheckout.vue", () => ({
	default: { template: "<div />" },
}))
// The router is only asked for the routes of the two guest pages: its other imports are not under test
vi.mock("@/composables/useShift", () => ({ shiftState: {} }))
vi.mock("@/data/user", () => ({ userResource: {} }))
vi.mock("@/data/session", () => ({ session: { isLoggedIn: true } }))

const { default: GuestOrder } = await import("../GuestOrder.vue")
const { default: TakeawayOrder } = await import("../TakeawayOrder.vue")
const { useGuestOrderStore } = await import("@/stores/guestOrder")
const { default: router } = await import("../../router")
const { showScreen } = await import("@/utils/tabTitle")

const API = "/api/method/pos_next.api.guest_ordering."

/** What the server answers, per call; a test sets what differs. */
const server = {
	restaurant_name: "The Bistro",
	// The company an invoice would name: it is not the restaurant, and the tab never takes it for one
	company: "",
}

function serve() {
	globalThis.fetch = vi.fn(async (url) => {
		const call = String(url).split(API)[1]
		const answers = {
			validate_token: {
				valid: true,
				mode: "restaurant",
				table: { name: "TBL-1", table_name: "T1", area_name: "Room 1" },
				currency: "CHF",
				company_logo: "",
				restaurant_name: server.restaurant_name,
				qr_order_validation: "Direct to Kitchen",
				guest_account_mode: "Not Proposed",
				has_loyalty_program: false,
			},
			get_guest_menu: { categories: [] },
			get_order_status: server.company
				? {
						invoice: "SINV-1",
						items: [],
						grand_total: 0,
						company: server.company,
					}
				: { invoice: null, items: [], grand_total: 0, net_total: 0 },
			create_takeaway_token: {
				token: "tok-take",
				name: "GOT-1",
				restaurant_name: server.restaurant_name,
			},
		}
		return { ok: true, json: async () => ({ message: answers[call] }) }
	})
}

async function settle() {
	for (let round = 0; round < 4; round++) await flushPromises()
}

let pinia
let opened = []

/** A guest page as a diner arrives on it: the router names its tab first, then the page loads. */
async function open(page, address) {
	showScreen(router.resolve(address))
	const wrapper = mount(page, {
		global: { plugins: [pinia], mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	await settle()
	return wrapper
}

beforeEach(() => {
	pinia = createPinia()
	setActivePinia(pinia)
	opened = []
	words.catalogue = {}
	server.restaurant_name = "The Bistro"
	server.company = ""
	document.title = "Neopos"
	window.frappe = { realtime: { subscribe: vi.fn(), on: vi.fn() } }
	serve()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	delete window.frappe
})

describe("the tab of the page a table's guests order from", () => {
	it("names the restaurant of the session before there is any order", async () => {
		await open(GuestOrder, "/guest/tok-1")

		expect(document.title).toBe("The Bistro · Neopos")
	})

	it("tells two restaurants of one company apart", async () => {
		server.company = "One Company"
		server.restaurant_name = "The Bistro"
		const first = await open(GuestOrder, "/guest/tok-1")
		expect(document.title).toBe("The Bistro · Neopos")
		first.unmount()

		server.restaurant_name = "The Terrace"
		await open(GuestOrder, "/guest/tok-1")
		expect(document.title).toBe("The Terrace · Neopos")
	})

	it("takes the restaurant for the name, never the company of an order", async () => {
		// The order status of an invoice names the company; the session names the restaurant
		server.company = "One Company"

		await open(GuestOrder, "/guest/tok-1")

		expect(document.title).toBe("The Bistro · Neopos")
	})

	it("falls back on the word of the screen when the session names no restaurant", async () => {
		server.restaurant_name = ""

		await open(GuestOrder, "/guest/tok-1")

		expect(document.title).toBe("Order · Neopos")
	})

	it("says that word in the user's language, and the restaurant's name as it was written", async () => {
		words.catalogue = { Order: "Commande" }
		server.restaurant_name = ""
		await open(GuestOrder, "/guest/tok-1")
		expect(document.title).toBe("Commande · Neopos")

		server.restaurant_name = "Order"
		await open(GuestOrder, "/guest/tok-1")
		expect(document.title).toBe("Order · Neopos")
	})

	it("keeps the name in the store from the validation of the token, and forgets it with the session", async () => {
		const wrapper = await open(GuestOrder, "/guest/tok-1")
		const store = useGuestOrderStore()
		expect(store.restaurantName).toBe("The Bistro")

		wrapper.unmount()

		expect(store.restaurantName).toBe("")
	})
})

describe("the tab of the web takeaway order", () => {
	it("names the restaurant of the takeaway session", async () => {
		await open(TakeawayOrder, "/order")

		expect(document.title).toBe("The Bistro · Neopos")
	})

	it("falls back on the word of the screen when the session names no restaurant", async () => {
		server.restaurant_name = ""

		await open(TakeawayOrder, "/order")

		expect(document.title).toBe("Order · Neopos")
	})
})

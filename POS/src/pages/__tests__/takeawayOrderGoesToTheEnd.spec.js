/**
 * //// Neoffice — added file (no upstream equivalent). The web takeaway page goes to the end (neoffice-maintenance#2132): the session of an order
 * //// outlives a page load (the payment page sends the customer back, and a new token would have lost the order, the account and the payment),
 * //// "Pay & Order" first sends the cart (a payment needs an order to pay), the payment is waited for until the provider confirms it, and the
 * //// customer is given the number to show at pickup. The page is mounted as a customer meets it, over the real store, with the server answering
 * //// through `fetch`.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (msgid, args) =>
		args ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid
})

vi.mock("@/composables/useTabTitle", () => ({ useTabTitle: () => {} }))

const { default: TakeawayOrder } = await import("../TakeawayOrder.vue")
const { useGuestOrderStore } = await import("@/stores/guestOrder")

const API = "/api/method/pos_next.api.guest_ordering."
const KEY = "pos_next_takeaway_token"
const MARIE = { customer: "CUST-1", customer_name: "Marie Dupont", source: "account", loyalty_points: 0, loyalty_value: 0, loyalty_program: null }

let server
let calls
let pinia
let opened = []

function serve() {
	calls = []
	globalThis.fetch = vi.fn(async (url, init) => {
		const call = String(url).split(API)[1]
		const body = JSON.parse(init?.body || "{}")
		calls.push({ call, body, credentials: init?.credentials })
		if (server.refuse?.[call]?.(body)) {
			return {
				ok: false,
				json: async () => ({ exc_type: "ValidationError", _server_messages: JSON.stringify([JSON.stringify({ message: "Refused." })]) }),
			}
		}
		const answers = {
			create_takeaway_token: () => ({ token: "tok-new", name: "GOT-1", restaurant_name: "The Bistro" }),
			validate_token: () => ({
				valid: true,
				mode: "takeaway",
				table: null,
				currency: "CHF",
				company_logo: "",
				restaurant_name: "The Bistro",
				qr_order_validation: "Direct to Kitchen",
				guest_account_mode: "Mandatory",
				has_loyalty_program: false,
				account: server.account,
			}),
			get_guest_menu: () => ({ categories: [] }),
			get_order_status: () => ({ invoice: server.invoice, items: [], grand_total: server.total, net_total: server.total, account: server.account }),
			submit_guest_order: () => {
				server.invoice = "SINV-1"
				server.total = 12
				return { invoice: "SINV-1", grand_total: 12, status: "awaiting_payment" }
			},
			confirm_guest_payment: () => server.confirmations.shift() || { status: "awaiting_payment" },
		}
		return { ok: true, json: async () => ({ message: answers[call]() }) }
	})
}

async function settle() {
	for (let round = 0; round < 4; round++) await flushPromises()
}

async function openThePage() {
	const wrapper = mount(TakeawayOrder, {
		global: { plugins: [pinia], mocks: { __: globalThis.__ }, stubs: { GuestMenuView: true, GuestCart: true, GuestCheckout: true } },
	})
	opened.push(wrapper)
	await settle()
	return wrapper
}

const asked = (name) => calls.filter(({ call }) => call === name)

beforeEach(() => {
	pinia = createPinia()
	setActivePinia(pinia)
	window.sessionStorage.clear()
	server = { account: MARIE, invoice: null, total: 0, confirmations: [] }
	serve()
})

afterEach(() => {
	for (const wrapper of opened) wrapper.unmount()
	opened = []
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("the session of the order outlives a page load", () => {
	it("asks for a token once, keeps it for the tab, and is back on it when the page comes back", async () => {
		await openThePage()
		expect(asked("create_takeaway_token")).toHaveLength(1)
		expect(window.sessionStorage.getItem(KEY)).toBe("tok-new")

		for (const wrapper of opened) wrapper.unmount()
		opened = []
		setActivePinia((pinia = createPinia()))
		await openThePage()

		expect(asked("create_takeaway_token")).toHaveLength(1)
		expect(asked("validate_token").map(({ body }) => body.token)).toEqual(["tok-new", "tok-new"])
	})

	it("asks for a new token when the kept one is refused", async () => {
		window.sessionStorage.setItem(KEY, "tok-old")
		server.refuse = { validate_token: (body) => body.token === "tok-old" }

		await openThePage()

		expect(asked("create_takeaway_token")).toHaveLength(1)
		expect(window.sessionStorage.getItem(KEY)).toBe("tok-new")
	})

	it("asks the server without any session, like the rest of the guest page", async () => {
		await openThePage()

		expect(asked("create_takeaway_token")[0].credentials).toBe("omit")
	})
})

describe("Pay & Order first sends the cart", () => {
	async function withACart() {
		const page = await openThePage()
		useGuestOrderStore().cart = [{ item: { item_code: "ITEM-1", item_name: "Soup" }, qty: 2, modifiers: [], price: 6 }]
		await settle()
		return page
	}
	const payButton = (page) => page.findAll("button").find((button) => button.text().includes("Pay & Order"))

	it("makes the order, then shows the payment", async () => {
		const page = await withACart()

		await payButton(page).trigger("click")
		await settle()

		expect(asked("submit_guest_order")).toHaveLength(1)
		expect(JSON.parse(asked("submit_guest_order")[0].body.items)[0]).toMatchObject({ item_code: "ITEM-1", qty: 2 })
		expect(page.findComponent({ name: "GuestCheckout" }).isVisible()).toBe(true)
	})

	it("stays on the cart, with what the server said, when the order is refused", async () => {
		server.refuse = { submit_guest_order: () => true }
		const page = await withACart()

		await payButton(page).trigger("click")
		await settle()

		expect(page.findComponent({ name: "GuestCheckout" }).isVisible()).toBe(false)
		expect(useGuestOrderStore().error).toBe("Refused.")
	})

	it("does nothing with an empty cart and no order", async () => {
		const page = await openThePage()

		await payButton(page).trigger("click")
		await settle()

		expect(asked("submit_guest_order")).toHaveLength(0)
		expect(page.findComponent({ name: "GuestCheckout" }).isVisible()).toBe(false)
	})

	it("goes to the payment of an order that was sent before, with nothing more to send", async () => {
		server.invoice = "SINV-1"
		server.total = 12
		const page = await openThePage()

		await payButton(page).trigger("click")
		await settle()

		expect(asked("submit_guest_order")).toHaveLength(0)
		expect(page.findComponent({ name: "GuestCheckout" }).isVisible()).toBe(true)
	})
})

describe("the payment is waited for", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	async function theStore() {
		const store = useGuestOrderStore()
		store.token = "tok-new"
		return store
	}

	it("asks again until the provider has confirmed, then says what was paid and the number to show", async () => {
		server.confirmations = [{ status: "awaiting_payment" }, { status: "awaiting_payment" }, { status: "success", ticket: "T-12", submitted: true }]
		const store = await theStore()

		const done = store.confirmPayment(12, 0)
		await vi.advanceTimersByTimeAsync(6000)
		const result = await done

		expect(asked("confirm_guest_payment")).toHaveLength(3)
		expect(result).toMatchObject({ status: "success", ticket: "T-12" })
		expect(store.error).toBeNull()
	})

	it("says so after a minute and lets the customer ask again", async () => {
		const store = await theStore()

		const done = store.confirmPayment(12, 0)
		await vi.advanceTimersByTimeAsync(70000)
		const result = await done

		expect(result.status).toBe("awaiting_payment")
		expect(store.error).toBe("Your payment is not confirmed yet. Please reload this page in a moment.")
		server.confirmations = [{ status: "success", ticket: "T-13" }]
		expect((await store.confirmPayment(12, 0)).ticket).toBe("T-13")
	})
})

describe("the order is done", () => {
	it("shows the number to show at pickup, and forgets the session", async () => {
		const page = await openThePage()
		expect(window.sessionStorage.getItem(KEY)).toBe("tok-new")

		page.findComponent({ name: "GuestCheckout" }).vm.$emit("order-confirmed", "T-12")
		await settle()

		expect(page.text()).toContain("Order confirmed!")
		expect(page.text()).toContain("T-12")
		expect(window.sessionStorage.getItem(KEY)).toBeNull()
	})
})

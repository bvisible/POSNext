/**
 * //// Neoffice — added file (no upstream equivalent). The sign-in of the QR page (NeoResto lot 1, Daniel, 02.11.2026): a guest gives an address,
 * //// a code is mailed to it, the code proves it, and the customer of that address is the customer of the table; a new customer gives a name.
 * //// When the till already put a customer on the table the page takes that identity with no sign-in, and a restaurant that requires an account
 * //// takes no order before the guest is identified. The pages are mounted as a diner meets them, over the real store, with the server
 * //// answering through `fetch`.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (msgid, args) =>
		args ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid
})

vi.mock("vue-router", async (importOriginal) => ({
	...(await importOriginal()),
	useRoute: () => ({ params: { token: "tok-1" } }),
}))
vi.mock("@/components/guest/GuestMenuView.vue", () => ({ default: { template: "<div />" } }))
vi.mock("@/composables/useShift", () => ({ shiftState: {} }))
vi.mock("@/data/user", () => ({ userResource: {} }))
vi.mock("@/data/session", () => ({ session: { isLoggedIn: true } }))

const { default: GuestOrder } = await import("@/pages/GuestOrder.vue")
const { default: GuestCart } = await import("../GuestCart.vue")
const { default: GuestCheckout } = await import("../GuestCheckout.vue")
const { useGuestOrderStore } = await import("@/stores/guestOrder")

const API = "/api/method/pos_next.api.guest_ordering."
const MARIE = {
	customer: "CUST-1",
	customer_name: "Marie Dupont",
	source: "account",
	loyalty_points: 120,
	loyalty_value: 12,
	loyalty_program: "Friends",
}

/** What the server answers, per call; a test sets what differs. */
let server
let calls

function refusal(message) {
	return {
		ok: false,
		json: async () => ({ exc_type: "ValidationError", _server_messages: JSON.stringify([JSON.stringify({ message })]) }),
	}
}

function serve() {
	calls = []
	globalThis.fetch = vi.fn(async (url, init) => {
		const call = String(url).split(API)[1]
		const body = JSON.parse(init?.body || "{}")
		calls.push({ call, body })
		if (server.refuse?.[call]) return refusal(server.refuse[call])
		const answers = {
			validate_token: {
				valid: true,
				mode: "restaurant",
				table: { name: "TBL-1", table_name: "T1", area_name: "Room 1" },
				currency: "CHF",
				company_logo: "",
				restaurant_name: "The Bistro",
				qr_order_validation: "Direct to Kitchen",
				guest_account_mode: server.mode,
				has_loyalty_program: server.loyalty,
				account: server.account,
			},
			get_guest_menu: { categories: [] },
			get_order_status: { invoice: null, items: [], grand_total: 0, net_total: 0, account: server.account },
			request_guest_code: { sent: true },
			confirm_guest_code: server.confirmed,
			register_guest_account: { status: "signed_in", account: MARIE },
			submit_guest_order: { invoice: "SINV-1", grand_total: 5, status: "sent_to_kitchen" },
		}
		return { ok: true, json: async () => ({ message: answers[call] }) }
	})
}

async function settle() {
	for (let round = 0; round < 4; round++) await flushPromises()
}

let pinia
let opened = []

async function openThePage() {
	const wrapper = mount(GuestOrder, { global: { plugins: [pinia], mocks: { __: globalThis.__ }, stubs: { GuestCart: true, GuestCheckout: true } } })
	opened.push(wrapper)
	await settle()
	return wrapper
}

const asked = (name) => calls.filter(({ call }) => call === name)

async function type(wrapper, selector, value) {
	await wrapper.get(`[data-test="${selector}"]`).setValue(value)
}

async function press(wrapper, selector) {
	await wrapper.get(`[data-test="${selector}"]`).trigger("click")
	await settle()
}

beforeEach(() => {
	pinia = createPinia()
	setActivePinia(pinia)
	server = {
		mode: "Optional",
		loyalty: true,
		account: null,
		confirmed: { status: "signed_in", account: MARIE },
	}
	serve()
})

afterEach(() => {
	for (const wrapper of opened) wrapper.unmount()
	opened = []
	vi.restoreAllMocks()
})

describe("the sign-in is what the restaurant proposes", () => {
	it("is not there when the restaurant proposes no account", async () => {
		server.mode = "Not Proposed"

		const page = await openThePage()

		expect(page.find('[data-test="sign-in"]').exists()).toBe(false)
	})

	it("is offered in the header when the account is optional", async () => {
		const page = await openThePage()

		expect(page.find('[data-test="sign-in"]').exists()).toBe(true)
		expect(page.find('[data-test="account-sheet"]').exists()).toBe(false)
	})

	it("is offered when the account is required", async () => {
		server.mode = "Mandatory"

		const page = await openThePage()

		expect(page.find('[data-test="sign-in"]').exists()).toBe(true)
	})
})

describe("a customer signs in", () => {
	it("gives an address, gets a code, types it and is signed in", async () => {
		const page = await openThePage()
		await press(page, "sign-in")

		await type(page, "account-email", "marie@yopmail.com")
		await press(page, "account-send-code")

		expect(asked("request_guest_code")[0].body).toEqual({ token: "tok-1", email: "marie@yopmail.com" })
		expect(page.get('[data-test="account-code"]').exists()).toBe(true)

		await type(page, "account-code", "123456")
		await press(page, "account-confirm")

		expect(asked("confirm_guest_code")[0].body).toEqual({ token: "tok-1", email: "marie@yopmail.com", code: "123456" })
		expect(page.get('[data-test="account-name-line"]').text()).toBe("Hello Marie Dupont")
		expect(page.get('[data-test="account-points"]').text()).toBe("120")
		expect(page.get('[data-test="account-chip"]').text()).toContain("Marie Dupont")
		expect(page.get('[data-test="account-chip"]').text()).toContain("120 pts")
	})

	it("is told what the server said when the code is wrong, and stays on the code", async () => {
		server.refuse = { confirm_guest_code: "Wrong code." }
		const page = await openThePage()
		await press(page, "sign-in")
		await type(page, "account-email", "marie@yopmail.com")
		await press(page, "account-send-code")
		await type(page, "account-code", "000000")

		await press(page, "account-confirm")

		expect(page.get('[data-test="account-error"]').text()).toBe("Wrong code.")
		expect(page.find('[data-test="account-code"]').exists()).toBe(true)
		expect(useGuestOrderStore().account).toBeNull()
	})

	it("cannot confirm before the six digits are typed", async () => {
		const page = await openThePage()
		await press(page, "sign-in")
		await type(page, "account-email", "marie@yopmail.com")
		await press(page, "account-send-code")
		await type(page, "account-code", "123")

		expect(page.get('[data-test="account-confirm"]').attributes("disabled")).toBeDefined()
	})

	it("can ask for another address, or for a new code", async () => {
		const page = await openThePage()
		await press(page, "sign-in")
		await type(page, "account-email", "marie@yopmail.com")
		await press(page, "account-send-code")

		await press(page, "account-resend")
		expect(asked("request_guest_code")).toHaveLength(2)

		await press(page, "account-other-address")
		expect(page.find('[data-test="account-email"]').exists()).toBe(true)
	})

	it("shows no points when the restaurant has no loyalty programme", async () => {
		server.loyalty = false
		const page = await openThePage()
		await press(page, "sign-in")
		await type(page, "account-email", "marie@yopmail.com")
		await press(page, "account-send-code")
		await type(page, "account-code", "123456")
		await press(page, "account-confirm")

		expect(page.find('[data-test="account-points"]').exists()).toBe(false)
		expect(page.get('[data-test="account-chip"]').text()).not.toContain("pts")
	})
})

describe("an address nobody has yet", () => {
	it("asks for a name after the code, then makes the account and signs in", async () => {
		server.confirmed = { status: "needs_registration" }
		const page = await openThePage()
		await press(page, "sign-in")
		await type(page, "account-email", "new@yopmail.com")
		await press(page, "account-send-code")
		await type(page, "account-code", "123456")
		await press(page, "account-confirm")

		expect(page.get('[data-test="account-name"]').exists()).toBe(true)
		expect(page.get('[data-test="account-register"]').attributes("disabled")).toBeDefined()

		await type(page, "account-name", "Marie Dupont")
		await type(page, "account-phone", "+41 79 000 00 00")
		await press(page, "account-register")

		expect(asked("register_guest_account")[0].body).toEqual({
			token: "tok-1",
			email: "new@yopmail.com",
			customer_name: "Marie Dupont",
			mobile_no: "+41 79 000 00 00",
		})
		expect(page.get('[data-test="account-name-line"]').text()).toBe("Hello Marie Dupont")
	})
})

describe("the till already put a customer on the table", () => {
	beforeEach(() => {
		server.account = { ...MARIE, source: "till" }
	})

	it("takes that identity with no sign-in", async () => {
		const page = await openThePage()

		expect(page.find('[data-test="sign-in"]').exists()).toBe(false)
		expect(page.get('[data-test="account-chip"]').text()).toContain("Marie Dupont")
		expect(useGuestOrderStore().mustSignIn).toBe(false)
	})

	it("says so in the sheet", async () => {
		const page = await openThePage()

		await press(page, "account-chip")

		expect(page.get('[data-test="account-sheet"]').text()).toContain("Your server linked this table to your account.")
	})

	it("follows the till when it changes the customer while the page is open", async () => {
		const page = await openThePage()
		const store = useGuestOrderStore()
		server.account = { ...MARIE, customer_name: "Paul Durand", source: "till" }

		await store.refreshOrderStatus()
		await settle()

		expect(page.get('[data-test="account-chip"]').text()).toContain("Paul Durand")
	})

	it("forgets the customer when the till takes it off the table", async () => {
		const page = await openThePage()
		const store = useGuestOrderStore()
		server.account = null

		await store.refreshOrderStatus()
		await settle()

		expect(store.account).toBeNull()
		expect(page.find('[data-test="sign-in"]').exists()).toBe(true)
	})
})

describe("a restaurant that requires an account", () => {
	async function theCart() {
		const store = useGuestOrderStore()
		await store.validateToken("tok-1")
		store.cart = [{ item: { item_code: "ITEM-1", item_name: "Soup" }, qty: 1, modifiers: [], price: 5 }]
		const cart = mount(GuestCart, { global: { plugins: [pinia], mocks: { __: globalThis.__ } } })
		opened.push(cart)
		await settle()
		return { cart, store }
	}

	beforeEach(() => {
		server.mode = "Mandatory"
	})

	it("opens the sign-in where the order would go, and sends nothing", async () => {
		const { cart } = await theCart()

		await cart.get("button.bg-green-600").trigger("click")
		await settle()

		expect(cart.emitted("sign-in-needed")).toHaveLength(1)
		expect(cart.emitted("order-sent")).toBeUndefined()
		expect(asked("submit_guest_order")).toHaveLength(0)
		expect(cart.get('[data-test="cart-sign-in-notice"]').text()).toBe("Please sign in to order.")
	})

	it("sends the order once the guest is identified", async () => {
		const { cart, store } = await theCart()
		store.account = MARIE

		await cart.get("button.bg-green-600").trigger("click")
		await settle()

		expect(asked("submit_guest_order")).toHaveLength(1)
		expect(cart.emitted("order-sent")).toHaveLength(1)
		expect(cart.find('[data-test="cart-sign-in-notice"]').exists()).toBe(false)
	})

	it("does not let the guest pay before signing in, and offers the sign-in there", async () => {
		const store = useGuestOrderStore()
		await store.validateToken("tok-1")
		store.orderTotal = 5
		store.orderItems = [{ item_code: "ITEM-1", item_name: "Soup", qty: 1, rate: 5, amount: 5 }]
		const checkout = mount(GuestCheckout, { global: { plugins: [pinia], mocks: { __: globalThis.__ } } })
		opened.push(checkout)
		await settle()

		const pay = checkout.findAll("button").find((button) => button.text().startsWith("Pay"))
		expect(pay.attributes("disabled")).toBeDefined()
		expect(checkout.get('[data-test="checkout-sign-in"]').text()).toBe("Sign in to pay")

		await checkout.get('[data-test="checkout-sign-in"]').trigger("click")
		expect(checkout.emitted("sign-in")).toHaveLength(1)
	})
})

describe("the store", () => {
	it("keeps who the session is from the first call", async () => {
		server.account = MARIE
		const store = useGuestOrderStore()

		await store.validateToken("tok-1")

		expect(store.account.customer_name).toBe("Marie Dupont")
		expect(store.canSignIn).toBe(true)
		expect(store.mustSignIn).toBe(false)
	})

	it("forgets who the session is when the page is left", async () => {
		server.account = MARIE
		const store = useGuestOrderStore()
		await store.validateToken("tok-1")

		store.reset()

		expect(store.account).toBeNull()
	})

	it("reads the message of a refusal and not the name of its exception", async () => {
		server.refuse = { request_guest_code: "Too many codes asked for. Please try again later." }
		const store = useGuestOrderStore()
		await store.validateToken("tok-1")

		await expect(store.requestCode("marie@yopmail.com")).rejects.toThrow(
			"Too many codes asked for. Please try again later.",
		)
	})
})

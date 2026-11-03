/**
 * //// Neoffice — added file (no upstream equivalent). The link of the sign-in mail brings a guest back to the table they started from (NeoResto lot 1, Daniel, 03.11.2026:
 * //// « on commence par lire le QR que le serveur nous donne et de là on se connecte, comme ça on a la table pour rattacher le compte »). The link signs a customer in on
 * //// the phone, in the browser that asked for the code (the engine's cookie, which the page must keep), and redirects to the table's page: the page learns whose session it
 * //// is, offers « Continue as … » and links the account to the table only when the guest presses it. The pages are mounted as a diner meets them, over the real store.
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

const MARIE = {
	customer: "CUST-1",
	customer_name: "Marie Dupont",
	source: "account",
	loyalty_points: 0,
	loyalty_value: 0,
	loyalty_program: null,
}
const MARIES_SESSION = { user: "marie@yopmail.com", full_name: "Marie Dupont" }

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
		const [path, query] = String(url).split("/api/method/")[1].split("?")
		const call = path.replace("pos_next.api.guest_ordering.", "").replace("pos_next.api.utilities.", "utilities.")
		calls.push({ call, query, body: JSON.parse(init?.body || "{}"), init })
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
				has_loyalty_program: false,
				account: server.account,
			},
			get_guest_menu: { categories: [] },
			get_order_status: { invoice: null, items: [], grand_total: 0, net_total: 0, account: server.account },
			request_guest_code: { ok: true, resend_in: 30, expires_in: 600 },
			signed_in_account: { account: server.session },
			"utilities.get_csrf_token": { csrf_token: "csrf-of-the-session", session_id: "sid" },
			claim_signed_in_account: { status: "signed_in", account: MARIE },
		}
		return { ok: true, json: async () => ({ message: answers[call] }) }
	})
}

const asked = (name) => calls.filter(({ call }) => call === name)

async function settle() {
	for (let round = 0; round < 4; round++) await flushPromises()
}

let pinia
let opened = []

async function openThePage() {
	const wrapper = mount(GuestOrder, {
		global: { plugins: [pinia], mocks: { __: globalThis.__ }, stubs: { GuestCart: true, GuestCheckout: true } },
	})
	opened.push(wrapper)
	await settle()
	return wrapper
}

async function press(wrapper, selector) {
	await wrapper.get(`[data-test="${selector}"]`).trigger("click")
	await settle()
}

const signInAs = (user) => {
	document.cookie = `user_id=${encodeURIComponent(user)}; path=/`
}

beforeEach(() => {
	pinia = createPinia()
	setActivePinia(pinia)
	server = { mode: "Optional", account: null, session: null }
	serve()
})

afterEach(() => {
	for (const wrapper of opened) wrapper.unmount()
	opened = []
	document.cookie = "user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
	vi.restoreAllMocks()
})

describe("asking for a code, so that the link of the mail can find the browser again", () => {
	it("keeps the cookie the engine sets when the browser holds no session", async () => {
		const page = await openThePage()

		await press(page, "sign-in")
		await page.get('[data-test="account-email"]').setValue("marie@yopmail.com")
		await press(page, "account-send-code")

		expect(asked("request_guest_code")[0].init.credentials).toBe("include")
	})

	it("stays the guest's, with no cookie at all, in a browser signed in at the till", async () => {
		signInAs("waiter@bistro.ch")
		const page = await openThePage()

		await press(page, "sign-in")
		await page.get('[data-test="account-email"]').setValue("marie@yopmail.com")
		await press(page, "account-send-code")

		expect(asked("request_guest_code")[0].init.credentials).toBe("omit")
	})

	it("keeps every other call of the page cookie-less", async () => {
		const page = await openThePage()

		for (const { call, init } of calls.filter(({ call }) => ["validate_token", "get_guest_menu", "get_order_status"].includes(call))) {
			expect(init.credentials, call).toBe("omit")
		}
		expect(page.exists()).toBe(true)
	})
})

describe("the page the link brings the guest back to", () => {
	it("asks nothing about a session when the browser holds none, and offers no « continue »", async () => {
		const page = await openThePage()

		expect(asked("signed_in_account")).toHaveLength(0)
		expect(page.find('[data-test="account-sheet"]').exists()).toBe(false)
	})

	it("opens by itself on « Continue as … » for a customer's session, and links nothing yet", async () => {
		signInAs("marie@yopmail.com")
		server.session = MARIES_SESSION

		const page = await openThePage()

		expect(asked("signed_in_account")).toHaveLength(1)
		expect(asked("signed_in_account")[0].query).toBe("token=tok-1")
		expect(asked("signed_in_account")[0].init.credentials).toBe("include")
		expect(page.get('[data-test="account-signed-in-line"]').text()).toBe("You are signed in as Marie Dupont.")
		expect(page.get('[data-test="account-continue-as"]').text()).toBe("Continue as Marie Dupont")
		expect(asked("claim_signed_in_account")).toHaveLength(0)
	})

	it("links the account to the table when « Continue as … » is pressed, with the CSRF token of the session", async () => {
		signInAs("marie@yopmail.com")
		server.session = MARIES_SESSION
		const page = await openThePage()

		await press(page, "account-continue-as")

		const csrf = asked("utilities.get_csrf_token")[0]
		expect(csrf.init.credentials).toBe("include")
		const claim = asked("claim_signed_in_account")[0]
		expect(claim.body).toEqual({ token: "tok-1" })
		expect(claim.init.credentials).toBe("include")
		expect(claim.init.headers["X-Frappe-CSRF-Token"]).toBe("csrf-of-the-session")
		expect(page.get('[data-test="account-name-line"]').text()).toBe("Hello Marie Dupont")
	})

	it("says what the server refused, and stays where it is", async () => {
		signInAs("marie@yopmail.com")
		server.session = MARIES_SESSION
		server.refuse = { claim_signed_in_account: "This table is already linked to another customer account." }
		const page = await openThePage()

		await press(page, "account-continue-as")

		expect(page.get('[data-test="account-error"]').text()).toBe("This table is already linked to another customer account.")
		expect(page.find('[data-test="account-continue-as"]').exists()).toBe(true)
	})

	it("goes to the address step when the guest wants another address", async () => {
		signInAs("marie@yopmail.com")
		server.session = MARIES_SESSION
		const page = await openThePage()

		await press(page, "account-other-address")

		expect(page.find('[data-test="account-email"]').exists()).toBe(true)
		expect(page.find('[data-test="account-continue-as"]').exists()).toBe(false)
	})

	it("offers nothing to a member of the staff, whose session the server does not name", async () => {
		signInAs("waiter@bistro.ch")
		server.session = null

		const page = await openThePage()

		expect(asked("signed_in_account")).toHaveLength(1)
		expect(page.find('[data-test="account-sheet"]').exists()).toBe(false)
	})

	it("does not open when the table already has an account", async () => {
		signInAs("marie@yopmail.com")
		server.session = MARIES_SESSION
		server.account = MARIE

		const page = await openThePage()

		expect(page.find('[data-test="account-sheet"]').exists()).toBe(false)
	})

	it("does not open where the restaurant proposes no account", async () => {
		signInAs("marie@yopmail.com")
		server.session = MARIES_SESSION
		server.mode = "Not Proposed"

		const page = await openThePage()

		expect(page.find('[data-test="account-sheet"]').exists()).toBe(false)
	})
})

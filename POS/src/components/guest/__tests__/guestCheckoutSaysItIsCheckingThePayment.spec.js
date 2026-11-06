/**
 * //// Neoffice — added file (no upstream equivalent). The guest's page says what it is doing while a payment is on its way (product owner, 06.11.2026: « la page se rafraîchit
 * //// avant que le paiement soit passé et on croit que le paiement n'a pas passé »). Back from the payment page the guest used to meet the order as unpaid, with the Pay button live,
 * //// for the seconds the provider takes to settle it (23 s measured on a real card payment). The checkout is mounted as a guest meets it, over the real store, with the server
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

const { default: GuestCheckout } = await import("../GuestCheckout.vue")
const { useGuestOrderStore } = await import("@/stores/guestOrder")

const API = "/api/method/pos_next.api.guest_ordering."
const ORDER = [{ item_code: "TIRAMISU", item_name: "Tiramisu", qty: 1, rate: 12, amount: 12, kds_status: "Pending" }]

let server
let calls
let pinia
let wrapper

function serve() {
	calls = []
	globalThis.fetch = vi.fn(async (url, init) => {
		const call = String(url).split(API)[1]
		calls.push({ call, body: JSON.parse(init?.body || "{}") })
		const answers = {
			get_order_status: () => ({ invoice: "SINV-1", items: ORDER, grand_total: 12, paid_amount: server.paid, payment_status: server.paid ? "paid" : "pending" }),
			confirm_guest_payment: () => {
				const answer = server.confirmations.shift() || { status: "awaiting_payment" }
				if (answer.status === "success") server.paid = 12
				return answer
			},
			create_guest_payment: () => server.createPayment(),
		}
		return { ok: true, json: async () => ({ message: await answers[call]() }) }
	})
}

async function settle() {
	for (let round = 0; round < 4; round++) await flushPromises()
}

async function open(address) {
	window.history.pushState({}, "", address)
	const store = useGuestOrderStore()
	store.token = "tok"
	store.orderItems = ORDER
	store.orderTotal = 12
	store.currency = "CHF"
	wrapper = mount(GuestCheckout, { global: { plugins: [pinia], mocks: { __: globalThis.__ } } })
	return wrapper
}

const veil = () => wrapper.find("[data-test='payment-wait']")
const notice = () => wrapper.find("[data-test='payment-unconfirmed']")
const payButton = () => wrapper.findAll("button").find((button) => button.text().startsWith("Pay"))
const asked = (name) => calls.filter(({ call }) => call === name)

beforeEach(() => {
	vi.useFakeTimers()
	pinia = createPinia()
	setActivePinia(pinia)
	server = { paid: 0, confirmations: [], createPayment: () => ({ payment_url: "#provider" }) }
	serve()
})

afterEach(() => {
	wrapper?.unmount()
	vi.useRealTimers()
	window.history.pushState({}, "", "/")
})

describe("back from the payment page", () => {
	it("shows the veil from the first paint, keeps Pay shut, and shows the thanks once the provider has settled", async () => {
		server.confirmations = [{ status: "awaiting_payment" }, { status: "awaiting_payment" }, { status: "success", submitted: true }]
		await open("/pos/guest/tok?payment=success&amount=12&tip=0")

		// Before the server has said anything: the guest never meets the order as unpaid
		expect(veil().exists()).toBe(true)
		expect(veil().text()).toContain("Checking your payment...")
		expect(veil().text()).toContain("do not pay again")
		expect(payButton().attributes("disabled")).toBeDefined()

		await vi.advanceTimersByTimeAsync(3000)
		await settle()
		expect(veil().exists()).toBe(true)

		await vi.advanceTimersByTimeAsync(3500)
		await settle()
		expect(veil().exists()).toBe(false)
		expect(wrapper.text()).toContain("Your payment of")
		expect(window.location.search).toBe("")
		expect(notice().exists()).toBe(false)
	})

	it("says « not confirmed yet » after a minute, keeps the return's address, and asks again on a tap without paying twice", async () => {
		await open("/pos/guest/tok?payment=success&amount=12&tip=0")

		await vi.advanceTimersByTimeAsync(70000)
		await settle()
		expect(veil().exists()).toBe(false)
		expect(notice().exists()).toBe(true)
		expect(notice().text()).toContain("Your payment is not confirmed yet.")
		expect(notice().text()).toContain("do not pay again")
		// Not an error in red, and Pay stays shut: the money may be on its way
		expect(wrapper.text()).not.toContain("Please reload this page")
		expect(payButton().attributes("disabled")).toBeDefined()
		// A reload would ask again: the address still carries the return
		expect(window.location.search).toContain("payment=success")

		const before = asked("confirm_guest_payment").length
		server.confirmations = [{ status: "success", submitted: true }]
		await notice().find("[data-test='payment-check-again']").trigger("click")
		expect(veil().exists()).toBe(true)
		await settle()

		expect(asked("confirm_guest_payment").length).toBe(before + 1)
		expect(veil().exists()).toBe(false)
		expect(notice().exists()).toBe(false)
		expect(wrapper.text()).toContain("Your payment of")
		expect(window.location.search).toBe("")
	})

	it("a payment the provider refused is told as refused, with Pay open again", async () => {
		server.confirmations = [{ status: "failed" }]
		await open("/pos/guest/tok?payment=success&amount=12&tip=0")
		await settle()

		expect(veil().exists()).toBe(false)
		expect(notice().exists()).toBe(false)
		expect(wrapper.text()).toContain("Payment was cancelled or failed. Please try again.")
		expect(payButton().attributes("disabled")).toBeUndefined()
	})
})

describe("on the way to the payment page", () => {
	it("shows a veil between the tap on Pay and the provider's page, and lifts it when the browser's back button restores the page", async () => {
		let answer
		server.createPayment = () => new Promise((resolve) => (answer = resolve))
		await open("/pos/guest/tok")
		expect(veil().exists()).toBe(false)

		await payButton().trigger("click")
		await settle()
		expect(veil().exists()).toBe(true)
		expect(veil().text()).toContain("Opening the secure payment page...")

		answer({ payment_url: "#provider" })
		await settle()
		// The browser is leaving: the veil stays until the page is gone
		expect(veil().exists()).toBe(true)

		// The back button brings the page back from the browser's memory, as it was left
		const event = new Event("pageshow")
		event.persisted = true
		window.dispatchEvent(event)
		await settle()
		expect(veil().exists()).toBe(false)
		expect(payButton().attributes("disabled")).toBeUndefined()
	})
})

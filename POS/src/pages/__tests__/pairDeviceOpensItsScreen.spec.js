/**
 * //// Neoffice — added file (no upstream equivalent). A kitchen's or a runner's tablet opens its screen by scanning
 * //// the QR code a manager shows at the till (NeoRestau lot 1, task 16): the page the code opens hands it over by a
 * //// POST (never a GET, which a link preview could make), takes it out of the address at once, and goes to the
 * //// screen the server names. A code that opens nothing says so clearly, in the server's words.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const openPage = vi.hoisted(() => vi.fn())
vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, index) => args[index]) : text)
})
vi.mock("@/utils/tabletSession", () => ({ openPage }))

const { default: PairDevice } = await import("../PairDevice.vue")

const REDEEM = "/api/method/pos_next.api.restaurant_devices.redeem_pairing_code"
const TOKEN = `Zx3_kQ-9${"a".repeat(35)}`
const SCREEN = "/pos/kds?restaurant=The+Bistro&station=st-1"

function answer(status, body) {
	return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function refusal(status, exc_type, message) {
	return answer(status, {
		exc_type,
		_server_messages: JSON.stringify([JSON.stringify({ message })]),
	})
}

let fetchMock
let opened = []

function visit(address) {
	window.history.replaceState({}, "", address)
	const wrapper = mount(PairDevice, {
		global: {
			mocks: { __: globalThis.__ },
			stubs: { RouterLink: { props: ["to"], template: "<a data-test='sign-in'><slot /></a>" } },
		},
	})
	opened.push(wrapper)
	return wrapper
}

const text = (wrapper, test) => wrapper.get(`[data-test=${test}]`).text()

beforeEach(() => {
	fetchMock = vi.fn()
	vi.stubGlobal("fetch", fetchMock)
	openPage.mockReset()
	window.csrf_token = undefined
	opened = []
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.unstubAllGlobals()
})

describe("the page a tablet opens by scanning the code", () => {
	it("posts the token and goes to the tablet's screen", async () => {
		fetchMock.mockResolvedValue(answer(200, { message: { redirect: SCREEN } }))

		visit(`/pos/pair#${TOKEN}`)
		await flushPromises()

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, request] = fetchMock.mock.calls[0]
		expect(url).toBe(REDEEM)
		expect(request.method).toBe("POST")
		// The server names it `token` wherever it holds it, which its error snapshots redact
		expect(JSON.parse(request.body)).toEqual({ token: TOKEN })
		// Loaded anew, with the session the tablet now holds
		expect(openPage).toHaveBeenCalledWith(SCREEN)
	})

	it("takes the token out of the address at once, so that a reload never tries it again", async () => {
		fetchMock.mockResolvedValue(answer(200, { message: { redirect: SCREEN } }))

		visit(`/pos/pair#${TOKEN}`)

		expect(window.location.hash).toBe("")
		expect(window.location.href).not.toContain(TOKEN)
	})

	it("sends the CSRF token of a browser that is already signed in", async () => {
		window.csrf_token = "token-of-the-session"
		fetchMock.mockResolvedValue(answer(200, { message: { redirect: SCREEN } }))

		visit(`/pos/pair#${TOKEN}`)
		await flushPromises()

		expect(fetchMock.mock.calls[0][1].headers["X-Frappe-CSRF-Token"]).toBe("token-of-the-session")
	})

	it("says clearly that an expired or used code opens nothing, in the server's words", async () => {
		const words = "This code has expired or was already used. Ask for a new one at the till."
		fetchMock.mockResolvedValue(refusal(417, "PairingCodeError", words))

		const wrapper = visit(`/pos/pair#${TOKEN}`)
		await flushPromises()

		expect(openPage).not.toHaveBeenCalled()
		expect(text(wrapper, "pair-title")).toBe("This code no longer opens a screen")
		expect(text(wrapper, "pair-message")).toBe(words)
	})

	it("says the same with its own words when the server gave none", async () => {
		fetchMock.mockResolvedValue(answer(417, { exc_type: "PairingCodeError" }))

		const wrapper = visit(`/pos/pair#${TOKEN}`)
		await flushPromises()

		expect(text(wrapper, "pair-title")).toBe("This code no longer opens a screen")
		expect(text(wrapper, "pair-message")).toContain("expired or was already used")
	})

	it("asks to wait when the address tried too often", async () => {
		fetchMock.mockResolvedValue(refusal(429, "RateLimitExceededError", "You hit the rate limit"))

		const wrapper = visit(`/pos/pair#${TOKEN}`)
		await flushPromises()

		expect(text(wrapper, "pair-title")).toBe("Too many attempts")
		expect(openPage).not.toHaveBeenCalled()
	})

	it("asks to check the connection when the server cannot be reached", async () => {
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

		const wrapper = visit(`/pos/pair#${TOKEN}`)
		await flushPromises()

		expect(text(wrapper, "pair-title")).toBe("The screen could not be opened")
		expect(text(wrapper, "pair-message")).toContain("connection")
	})

	it("never follows an answer that leads out of the till", async () => {
		fetchMock.mockResolvedValue(answer(200, { message: { redirect: "https://elsewhere.example/" } }))

		const wrapper = visit(`/pos/pair#${TOKEN}`)
		await flushPromises()

		expect(openPage).not.toHaveBeenCalled()
		expect(text(wrapper, "pair-title")).toBe("The screen could not be opened")
	})

	it("with no code, says how to get one and asks the server nothing", async () => {
		const wrapper = visit("/pos/pair")
		await flushPromises()

		expect(fetchMock).not.toHaveBeenCalled()
		expect(text(wrapper, "pair-title")).toBe("Scan the code shown at the till")
		expect(text(wrapper, "pair-message")).toContain("“Open a tablet”")
		expect(text(wrapper, "sign-in")).toBe("Sign in with a password")
	})
})

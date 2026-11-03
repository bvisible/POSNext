/**
 * //// Neoffice — added file (no upstream equivalent). The calls of the guest's page (the QR code of a table) carry no session (product owner, 03.11.2026): a browser signed in
 * //// at the till (a waiter or the owner scanning a table's code with their own phone) sent its cookie, Frappe asked for a CSRF token the guest page never has, and the page read
 * //// « Link invalid or expired » although the code was good.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

const { useGuestOrderStore } = await import("../guestOrder")

const VALID = { message: { valid: true, mode: "restaurant", table: { name: "T1" }, pos_profile: "Till", currency: "CHF" } }

beforeEach(() => {
	setActivePinia(createPinia())
	globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => VALID }))
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe("the guest's calls", () => {
	it("are sent without the browser's session", async () => {
		await useGuestOrderStore().validateToken("e_abc")

		const [url, options] = globalThis.fetch.mock.calls[0]
		expect(url).toContain("pos_next.api.guest_ordering.validate_token")
		expect(options.credentials).toBe("omit")
	})

	it("carry no CSRF token either", async () => {
		await useGuestOrderStore().validateToken("e_abc")

		const [, options] = globalThis.fetch.mock.calls[0]
		expect(JSON.stringify(options.headers).toLowerCase()).not.toContain("csrf")
	})

	it("hand the table's token to the server in the body", async () => {
		await useGuestOrderStore().validateToken("e_abc")

		const [, options] = globalThis.fetch.mock.calls[0]
		expect(JSON.parse(options.body)).toEqual({ token: "e_abc" })
	})
})

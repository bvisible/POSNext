/**
 * //// Neoffice — added file (no upstream equivalent). The customer display keeps the key of its own account, never the
 * //// client's super account's (maintenance#2296, audit Q2): it pairs with the password a till manager draws at the till,
 * //// the key it kept before leaves the browser unread, and a key the server refuses is dropped.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	createResource: () => ({ fetch: vi.fn(async () => []) }),
}))
vi.mock("@/utils/csrf", () => ({ ensureCSRFToken: vi.fn(async () => true) }))

const { useCustomerDisplayStore, STORAGE_KEY_API_KEY } = await import("../customerDisplay")

const LEGACY = "pos_display_api_key"

function answer(body) {
	return { ok: true, json: async () => body }
}

beforeEach(() => {
	localStorage.clear()
	setActivePinia(createPinia())
})

afterEach(() => {
	vi.restoreAllMocks()
	localStorage.clear()
})

describe("the customer display's key", () => {
	it("is kept under a name of its own, and the super account's key it kept before is dropped unread", () => {
		localStorage.setItem(LEGACY, "06fd969c2755b58:the-api-password")
		globalThis.fetch = vi.fn()
		useCustomerDisplayStore()
		expect(STORAGE_KEY_API_KEY).not.toBe(LEGACY)
		expect(localStorage.getItem(LEGACY)).toBeNull()
		expect(globalThis.fetch).not.toHaveBeenCalled()
	})

	it("is the one the server answers for the password typed", async () => {
		globalThis.fetch = vi.fn(async () =>
			answer({ message: { success: true, key: "k1:s1", user: "customer-display@displays.invalid" } }),
		)
		const store = useCustomerDisplayStore()
		expect(await store.pair("s1")).toBe(true)
		const [url, options] = globalThis.fetch.mock.calls[0]
		expect(url).toContain("pos_next.api.customer_display.pair_display")
		expect(new URLSearchParams(options.body).get("password")).toBe("s1")
		expect(localStorage.getItem(STORAGE_KEY_API_KEY)).toBe("k1:s1")
		expect(store.isAuthenticated).toBe(true)
	})

	it("is dropped when the server refuses it", async () => {
		localStorage.setItem(STORAGE_KEY_API_KEY, "k1:old")
		globalThis.fetch = vi.fn(async () =>
			answer({ exc_type: "AuthenticationError", _server_messages: JSON.stringify(["Invalid API key"]) }),
		)
		const store = useCustomerDisplayStore()
		expect(await store.tryRestoreSession()).toBe(false)
		expect(localStorage.getItem(STORAGE_KEY_API_KEY)).toBeNull()
	})

	it("is kept when the server does not answer", async () => {
		localStorage.setItem(STORAGE_KEY_API_KEY, "k1:s1")
		globalThis.fetch = vi.fn(async () => {
			throw new TypeError("Failed to fetch")
		})
		const store = useCustomerDisplayStore()
		expect(await store.tryRestoreSession()).toBe(false)
		expect(localStorage.getItem(STORAGE_KEY_API_KEY)).toBe("k1:s1")
	})

	it("is built from no key half written in the page", () => {
		const page = readFileSync(resolve(__dirname, "../../components/customer-display/DisplayAuth.vue"), "utf8")
		expect(page).not.toMatch(/FIXED_API_KEY|06fd969c2755b58/)
		const requests = readFileSync(resolve(__dirname, "../../utils/csrf.js"), "utf8")
		expect(requests).toContain(`getItem("${STORAGE_KEY_API_KEY}")`)
	})
})

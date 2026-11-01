/**
 * //// Neoffice — added file (no upstream equivalent). A sign-in opens a session of its own, which the till has to ask the server to
 * //// keep open (NeoRestau lot 1, product owner, 01.11.2026): a sign-in, or a sign-out, in the same tab makes the till ask again
 * //// when its profile is loaded; without either, a page load asks once.
 * @vitest-environment jsdom
 */
import { flushPromises } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())

vi.mock("@/utils/apiWrapper", () => ({ call }))
// A resource is its options here: the test calls the hooks a request's answer would
vi.mock("frappe-ui", () => ({
	createResource: (options) => ({ ...options, submit: vi.fn(), reset: vi.fn() }),
}))
vi.mock("@/router", () => ({ default: { replace: vi.fn(), push: vi.fn() } }))
vi.mock("@/utils/csrf", () => ({ ensureCSRFToken: vi.fn(async () => {}) }))
vi.mock("@/data/user", () => ({
	userResource: { reload: vi.fn(async () => {}), reset: vi.fn() },
	userData: { refresh: vi.fn() },
}))
vi.mock("@/utils/promoApi", () => ({ promoApi: {} }))
// The rest of what a sign-out clears is not about the staying signed in
vi.mock("@/utils/draftManager", () => ({ clearAllDrafts: vi.fn(async () => {}) }))
vi.mock("@/utils/offline/offlineReceiptCache", () => ({ clearAllOfflineReceiptPayloads: vi.fn() }))
vi.mock("@/stores/posCart", () => ({
	usePOSCartStore: () => ({ clearCart: vi.fn(), posOpeningShift: null, posProfile: null }),
}))
vi.mock("@/stores/posUI", () => ({ usePOSUIStore: () => ({ resetAllDialogs: vi.fn() }) }))
vi.mock("@/composables/useSessionLock", () => ({
	useSessionLock: () => ({ clearLock: vi.fn(), stopActivityTracking: vi.fn() }),
}))
vi.mock("@/composables/useShift", () => ({ shiftState: { value: {} } }))

const { session } = await import("../session")
const { keepStaffSignedIn, forgetKeepSignedIn } = await import("@/utils/keepSignedIn")

const KEEP = "pos_next.api.session.keep_signed_in"
const keepCalls = () => call.mock.calls.filter(([method]) => method === KEEP)

describe("the till asks again to keep its staff signed in after a sign-in or a sign-out", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		forgetKeepSignedIn()
		call.mockReset()
		call.mockImplementation(async (method) =>
			method === KEEP ? { days: 30, stamped: true } : { success: true },
		)
	})

	it("asks once while the same session goes on", async () => {
		keepStaffSignedIn("Till 1")
		keepStaffSignedIn("Till 1")
		await flushPromises()

		expect(keepCalls()).toHaveLength(1)
	})

	it("asks again for the session a sign-in opens", async () => {
		keepStaffSignedIn("Till 1")
		await flushPromises()

		await session.login.onSuccess({})
		keepStaffSignedIn("Till 1")
		await flushPromises()

		expect(keepCalls()).toHaveLength(2)
	})

	it("asks again for the session that follows a sign-out", async () => {
		keepStaffSignedIn("Till 1")
		await flushPromises()

		await session.logout.onSuccess()
		keepStaffSignedIn("Till 1")
		await flushPromises()

		expect(keepCalls()).toHaveLength(2)
	})
})

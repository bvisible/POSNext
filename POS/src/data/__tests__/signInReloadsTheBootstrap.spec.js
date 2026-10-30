/**
 * //// Neoffice — added file (no upstream equivalent). The bootstrap carries what the till asks of its user: the
 * //// authorization policy and the PIN length, the switch to the desk, the till's settings with what he may manage
 * //// (NeoRestau lot 1, task 3). A sign-out resets it; a sign-in in the same tab, without a reload, loads the new
 * //// user's: an expense void then asks for approval instead of failing, and the PIN field has the server's length.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const signedIn = vi.hoisted(() => ({ user: null }))

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
// The rest of what a sign-out clears is not about the bootstrap
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
const { useBootstrapStore } = await import("@/stores/bootstrap")
const { useAuthorization, useAuthorizationDialog } = await import("@/composables/useAuthorization")

// What the bootstrap answers each user
const BOOTSTRAP = {
	manager: { success: true, authorization_policy: {}, authorization_pin_length: 4, can_switch_to_desk: 1 },
	cashier: {
		success: true,
		authorization_policy: { "Expense Void": 1 },
		authorization_pin_length: 6,
		can_switch_to_desk: 0,
	},
}

describe("a sign-in in the same tab loads the new user's bootstrap", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		call.mockReset()
		call.mockImplementation(async (method) =>
			method === "pos_next.api.bootstrap.get_initial_data" ? BOOTSTRAP[signedIn.user] : null,
		)
	})

	it("asks the new user's approvals with his PIN length after a sign-out and a sign-in", async () => {
		// The page was opened by the manager
		signedIn.user = "manager"
		await useBootstrapStore().loadInitialData()
		expect(useAuthorization().isAuthorizationRequired("Expense Void")).toBe(false)

		await session.logout.onSuccess()
		expect(useBootstrapStore().data).toBeNull()

		signedIn.user = "cashier"
		await session.login.onSuccess({})

		expect(useAuthorization().isAuthorizationRequired("Expense Void")).toBe(true)
		expect(useAuthorizationDialog().pinLength()).toBe(6)
		expect(useBootstrapStore().data.can_switch_to_desk).toBe(0)
	})

	it("loads the bootstrap at a sign-in on a page opened signed out", async () => {
		signedIn.user = "manager"

		await session.login.onSuccess({})

		expect(useBootstrapStore().data.can_switch_to_desk).toBe(1)
	})
})

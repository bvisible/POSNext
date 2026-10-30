//// Neoffice — added file (no upstream equivalent). What a user may manage of the restaurant comes with the till's
//// settings (`restaurant_can`, NeoRestau lot 1, task 3) and is that user's. The path the app runs: a user signs in
//// (the page's bootstrap preloads his settings), signs out (utils/sessionCleanup), and another one signs in in the
//// same tab without a reload: the next user is told his own rights, never the previous user's.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
// What get_pos_settings answers the user who asks
const answer = vi.hoisted(() => ({ settings: {} }))

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("frappe-ui", () => ({
	createResource: (options) => ({
		submit: vi.fn(async () => {
			options.onSuccess(answer.settings)
			return answer.settings
		}),
	}),
}))
// The rest of what a logout clears is not about the till's settings
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

const { useBootstrapStore } = await import("../bootstrap")
const { usePOSSettingsStore } = await import("../posSettings")
const { cleanupUserSession } = await import("@/utils/sessionCleanup")

const MANAGER_RIGHTS = { manage_floor: true, manage_cards: true, manage_till_settings: true }
const CASHIER_RIGHTS = { manage_floor: false, manage_cards: false, manage_till_settings: false, view_tips: true }

async function signIn(rights) {
	// The page's bootstrap preloads the till's settings of whoever opened it
	call.mockImplementation(async (method) =>
		method === "pos_next.api.bootstrap.get_initial_data"
			? { success: true, pos_settings: { pos_profile: "Till", restaurant_can: rights } }
			: null,
	)
	await useBootstrapStore().loadInitialData()
	await usePOSSettingsStore().loadSettings("Till")
}

describe("posSettings: what the user may manage of the restaurant", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		call.mockReset()
		answer.settings = {}
	})

	it("is nothing before the settings are loaded", () => {
		expect(usePOSSettingsStore().settings.restaurant_can).toEqual({})
	})

	it("is the signed-in user's own", async () => {
		await signIn(MANAGER_RIGHTS)

		expect(usePOSSettingsStore().settings.restaurant_can).toEqual(MANAGER_RIGHTS)
	})

	it("is nothing once the user signs out", async () => {
		await signIn(MANAGER_RIGHTS)

		await cleanupUserSession()

		expect(usePOSSettingsStore().settings.restaurant_can).toEqual({})
		expect(useBootstrapStore().getPreloadedPOSSettings()).toBeNull()
	})

	it("is the next user's own when another one signs in in the same tab", async () => {
		await signIn(MANAGER_RIGHTS)
		await cleanupUserSession()

		// No reload: the till reads the next user's settings from the server, which tells him his own rights
		answer.settings = { pos_profile: "Till", restaurant_can: CASHIER_RIGHTS }
		await usePOSSettingsStore().loadSettings("Till")

		expect(usePOSSettingsStore().settings.restaurant_can).toEqual(CASHIER_RIGHTS)
	})
})

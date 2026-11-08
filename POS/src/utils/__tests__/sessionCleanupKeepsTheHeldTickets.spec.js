//// Neoffice — added file (no upstream equivalent). Signing out no longer erases, in silence, the tickets held on the device (NeoResto lot 1, the product owner, 08.11.2026: « s'il y a un brouillon,
//// il faut en faire quelque chose »): they stay, for their owner, and the closing and the sign-out dialogs list them so that the user keeps or deletes each by hand.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const drafts = vi.hoisted(() => ({ clearAllDrafts: vi.fn(async () => {}), deleteDraft: vi.fn(async () => {}) }))

vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("frappe-ui", () => ({ createResource: () => ({ submit: vi.fn() }) }))
vi.mock("@/utils/draftManager", () => drafts)
vi.mock("@/utils/offline/offlineReceiptCache", () => ({ clearAllOfflineReceiptPayloads: vi.fn() }))
vi.mock("@/stores/posCart", () => ({
	usePOSCartStore: () => ({ clearCart: vi.fn(), posOpeningShift: null, posProfile: null }),
}))
vi.mock("@/stores/posUI", () => ({ usePOSUIStore: () => ({ resetAllDialogs: vi.fn() }) }))
vi.mock("@/composables/useSessionLock", () => ({
	useSessionLock: () => ({ clearLock: vi.fn(), stopActivityTracking: vi.fn() }),
}))
vi.mock("@/composables/useShift", () => ({ shiftState: { value: {} } }))

const { cleanupUserSession } = await import("@/utils/sessionCleanup")

describe("signing out", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		drafts.clearAllDrafts.mockClear()
		drafts.deleteDraft.mockClear()
	})

	it("erases no held ticket of the device", async () => {
		await cleanupUserSession()

		expect(drafts.clearAllDrafts).not.toHaveBeenCalled()
		expect(drafts.deleteDraft).not.toHaveBeenCalled()
	})
})

//// Neoffice — added file (no upstream equivalent). The tickets held on a device belong to their owner (NeoResto lot 1, the product owner, 08.11.2026): signing out no longer erases them, so the list, the
//// count and the dialogs show the user's own and a colleague's stay out of sight; a ticket is written with its owner.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const stored = vi.hoisted(() => ({ drafts: [] }))

vi.mock("@/stores/serialNumber", () => ({ useSerialNumberStore: () => ({ returnSerials: vi.fn() }) }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() }),
}))
vi.mock("@/utils/draftManager", () => ({
	deleteDraft: vi.fn(async () => true),
	getAllDrafts: vi.fn(async () => stored.drafts),
	saveDraft: vi.fn(async (data) => ({ draft_id: "NEW", ...data })),
	updateDraft: vi.fn(async (id, data) => ({ draft_id: id, ...data })),
}))

globalThis.__ = (s) => s

const { usePOSDraftsStore } = await import("../posDrafts")
const { saveDraft, updateDraft } = await import("@/utils/draftManager")

const ticket = (id, owner) => ({ draft_id: id, items: [{ item_code: "A" }], ...(owner ? { owner } : {}) })

beforeEach(() => {
	setActivePinia(createPinia())
	document.cookie = "user_id=waiter@yopmail.com; path=/"
	saveDraft.mockClear()
	updateDraft.mockClear()
})

afterEach(() => {
	document.cookie = "user_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
})

describe("the tickets held on the device", () => {
	it("are listed for their owner alone, and a ticket with no owner for everybody", async () => {
		stored.drafts = [ticket("A", "waiter@yopmail.com"), ticket("B", "colleague@yopmail.com"), ticket("C")]
		const store = usePOSDraftsStore()

		await store.loadDrafts()

		expect(store.drafts.map((draft) => draft.draft_id)).toEqual(["A", "C"])
		expect(store.draftsCount).toBe(2)
	})

	it("are counted for their owner alone", async () => {
		stored.drafts = [ticket("A", "waiter@yopmail.com"), ticket("B", "colleague@yopmail.com")]
		const store = usePOSDraftsStore()

		await store.updateDraftsCount()

		expect(store.draftsCount).toBe(1)
	})

	it("are written with their owner, new or held again", async () => {
		stored.drafts = []
		const store = usePOSDraftsStore()

		await store.saveDraftInvoice([{ item_code: "A" }], "Walk-in", "Caisse")
		await store.saveDraftInvoice([{ item_code: "A" }], "Walk-in", "Caisse", [], "D-1")

		expect(saveDraft.mock.calls[0][0]).toMatchObject({ owner: "waiter@yopmail.com", pos_profile: "Caisse" })
		expect(updateDraft.mock.calls[0][1]).toMatchObject({ owner: "waiter@yopmail.com" })
	})
})

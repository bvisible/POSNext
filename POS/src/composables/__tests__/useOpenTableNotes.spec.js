/**
 * //// Neoffice — added file (no upstream equivalent). Opening a table, and the notes it has (NeoResto lot 1, notes: « table 5, .1, .2, .3 »). The server answers the note it opened (`note`, `note_name`) and the table's open notes
 * //// (`notes`); the cart keeps all three, whoever opened the table (the plan's tile, the list, the notice of a guest's order, a switch from one note to another). Without a `note` the server opens the LOWEST open note, and the call is
 * //// exactly the one of a table with one note; with a `note` it opens that one, or an empty new one the first « Valider » will create. A table with no order is its first note.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const answer = vi.hoisted(() => ({ value: null, fail: false, calls: [] }))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({})),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		answer.calls.push([method, args])
		if (answer.fail) throw new Error("offline")
		return answer.value
	}),
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till" }) }))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ askCoversOnOpen: true }),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }))

const { keepTheNotesOfTheOrder, noteToReadAgain, useOpenTable } = await import("../useOpenTable")
const { usePOSCartStore } = await import("@/stores/posCart")

const TABLE = { name: "t5", table_name: "Table 5", status: "Occupied" }
const summary = (rank, extra = {}) => ({
	name: `SINV-${rank}`,
	note: rank,
	note_name: null,
	covers: null,
	grand_total: 10,
	items_count: 1,
	kds_status: "Pending",
	...extra,
})
const line = (code) => ({ item_code: code, item_name: code, qty: 1, rate: 5, uom: "Unit", kds_status: "Pending" })

let cart
beforeEach(() => {
	setActivePinia(createPinia())
	cart = usePOSCartStore()
	answer.value = null
	answer.fail = false
	answer.calls = []
})

describe("opening a table without saying which note", () => {
	it("asks exactly what it asked before notes existed: no `note` key", async () => {
		answer.value = { name: "SINV-1", items: [line("soup")], note: 1, notes: [summary(1)] }

		await useOpenTable().openTable(TABLE)

		expect(answer.calls).toEqual([["pos_next.api.restaurant.open_table", { table_name: "t5", pos_profile: "Till" }]])
	})

	it("keeps the note the server opened (the lowest), its name and the table's notes", async () => {
		answer.value = {
			name: "SINV-2",
			items: [line("soup")],
			note: 2,
			note_name: "Dupont",
			notes: [summary(2, { note_name: "Dupont" }), summary(3)],
		}

		await useOpenTable().openTable(TABLE)

		expect(cart.restaurantNote).toBe(2)
		expect(cart.restaurantNoteName).toBe("Dupont")
		expect(cart.restaurantNotes.map((one) => one.note)).toEqual([2, 3])
		expect(cart.currentDraftId).toBe("SINV-2")
	})

	it("is the first note, with no name and no notes, for a table with no order", async () => {
		answer.value = { is_new: true, note: 1, note_name: null, notes: [] }

		await useOpenTable().openTable(TABLE)

		expect(cart.restaurantNote).toBe(1)
		expect(cart.restaurantNoteName).toBe("")
		expect(cart.currentDraftId).toBeNull()
		expect(cart.restaurantNotes.map((one) => [one.note, Boolean(one.pending)])).toEqual([[1, true]])
	})

	it("is the first note for a server that says nothing of notes", async () => {
		answer.value = { name: "SINV-1", items: [line("soup")] }

		await useOpenTable().openTable(TABLE)

		expect(cart.restaurantNote).toBe(1)
		expect(cart.restaurantNotes.map((one) => one.note)).toEqual([1])
	})
})

describe("opening a given note of a table", () => {
	it("passes the note on to the server", async () => {
		answer.value = { name: "SINV-2", items: [line("wine")], note: 2, notes: [summary(1), summary(2)] }

		await useOpenTable().openTable(TABLE, { note: 2 })

		expect(answer.calls).toEqual([["pos_next.api.restaurant.open_table", { table_name: "t5", pos_profile: "Till", note: 2 }]])
		expect(cart.restaurantNote).toBe(2)
		expect(cart.invoiceItems.map((one) => one.item_code)).toEqual(["wine"])
	})

	it("opens a new note as an empty one that is not on the server yet: no draft, the new note pending, the question about the people asked", async () => {
		answer.value = { is_new: true, note: 3, note_name: null, notes: [summary(1), summary(2)] }

		const opened = await useOpenTable().openTable(TABLE, { note: 3 })

		expect(opened).toBe(true)
		expect(cart.restaurantNote).toBe(3)
		expect(cart.currentDraftId).toBeNull()
		expect(cart.invoiceItems).toEqual([])
		expect(cart.restaurantNotes.map((one) => [one.note, Boolean(one.pending)])).toEqual([
			[1, false],
			[2, false],
			[3, true],
		])
		expect(cart.coversAsk).toBe("open")
	})

	it("takes the note asked when the answer names none", async () => {
		answer.value = { is_new: true, notes: [summary(1)] }

		await useOpenTable().openTable(TABLE, { note: 2 })

		expect(cart.restaurantNote).toBe(2)
	})

	it("does not ask the people of a note that already has its order", async () => {
		answer.value = { name: "SINV-2", items: [line("wine")], note: 2, notes: [summary(1), summary(2)] }

		await useOpenTable().openTable(TABLE, { note: 2 })

		expect(cart.coversAsk).toBeNull()
	})

	it("leaves the cart on the note it was on when the other note cannot be read", async () => {
		answer.value = { name: "SINV-1", items: [line("soup")], note: 1, notes: [summary(1), summary(2)] }
		await useOpenTable().openTable(TABLE)
		answer.fail = true
		const log = vi.spyOn(console, "error").mockImplementation(() => {})

		const opened = await useOpenTable().openTable(TABLE, { note: 2 })

		expect(opened).toBe(false)
		expect(cart.restaurantNote).toBe(1)
		expect(cart.invoiceItems.map((one) => one.item_code)).toEqual(["soup"])
		log.mockRestore()
	})

	it("takes the other note's name and covers out of the cart: each note has its own", async () => {
		answer.value = { name: "SINV-1", items: [line("soup")], note: 1, note_name: "Dupont", covers: 3, notes: [summary(1), summary(2)] }
		await useOpenTable().openTable(TABLE)
		expect(cart.restaurantCovers).toBe(3)

		answer.value = { name: "SINV-2", items: [line("wine")], note: 2, note_name: null, covers: 2, notes: [summary(1), summary(2)] }
		await useOpenTable().openTable(TABLE, { note: 2 })

		expect(cart.restaurantNoteName).toBe("")
		expect(cart.restaurantCovers).toBe(2)
	})
})

describe("what to ask to read the note in front of the waiter again", () => {
	it("is nothing for the first note of a table that has one", () => {
		expect(noteToReadAgain({ restaurantNote: 1, restaurantNotes: [summary(1)] })).toEqual({})
		expect(noteToReadAgain({})).toEqual({})
	})

	it("is the rank for a note that is not the first", () => {
		expect(noteToReadAgain({ restaurantNote: 2, restaurantNotes: [summary(2)] })).toEqual({ note: 2 })
	})

	it("is the rank for any note of a table that has several, the first included", () => {
		expect(noteToReadAgain({ restaurantNote: 1, restaurantNotes: [summary(1), summary(2)] })).toEqual({ note: 1 })
	})
})

describe("keeping the notes of an order the server answered", () => {
	it("is what the opening of a table and the reading again after a guest's order both do", () => {
		keepTheNotesOfTheOrder(cart, { note: 3, note_name: " Les  Martin ", notes: [summary(1), summary(3)] })

		expect(cart.restaurantNote).toBe(3)
		expect(cart.restaurantNoteName).toBe("Les Martin")
		expect(cart.restaurantNotes.map((one) => one.note)).toEqual([1, 3])
	})

	it("falls back on the note asked, and on the first", () => {
		keepTheNotesOfTheOrder(cart, {}, 4)
		expect(cart.restaurantNote).toBe(4)

		keepTheNotesOfTheOrder(cart, null)
		expect(cart.restaurantNote).toBe(1)
	})
})

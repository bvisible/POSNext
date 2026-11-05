/**
 * //// Neoffice — added file (no upstream equivalent). The cart knows which note of its table it is (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): a rank (1 by default), an optional name, and the notes the server told of the
 * //// table, plus the new note that exists only here until its first « Valider ». All of it is reset with the cart, and carried by BOTH payloads that save the order — the one of every « Valider » (`buildOfferEvaluationPayload`,
 * //// sent to update_invoice) and the one of the payment (`submitInvoice`) — under `restaurant_note` (and `restaurant_note_name`), left out for a table with its one first note so that it is saved exactly as before.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? `${s} ${args.join(" ")}` : s)
	return { sent: [] }
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: (options) => {
		const url = options?.url ?? ""
		const submit = vi.fn(async (params) => {
			server.sent.push({ url, params })
			if (url.endsWith("update_invoice") || url.endsWith("submit_invoice"))
				return { name: "SINV-0001" }
			return {
				items: [],
				free_items: [],
				applied_pricing_rules: [],
				discount_amount: 0,
			}
		})
		return { submit, reload: vi.fn(), fetch: vi.fn() }
	},
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showWarning: vi.fn(),
		showInfo: vi.fn(),
	}),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

const { usePOSCartStore } = await import("../posCart")

const burger = {
	item_code: "BURGER",
	item_name: "Burger",
	rate: 20,
	price_list_rate: 20,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
}
const PROFILE = {
	company: "Resto",
	currency: "CHF",
	selling_price_list: "Standard",
	customer: "Walk-in",
}
const note = (rank, extra = {}) => ({
	name: `SINV-${rank}`,
	note: rank,
	note_name: null,
	covers: null,
	grand_total: 0,
	items_count: 0,
	kds_status: "Pending",
	...extra,
})

const submitted = () =>
	server.sent.filter((call) => call.url.endsWith("submit_invoice")).at(-1).params
		.invoice
// The draft the payment saves first, before it submits it: found on the server by the table and the rank
const savedFirst = () =>
	server.sent.filter((call) => call.url.endsWith("update_invoice")).at(-1).params
		.data

let cart
beforeEach(() => {
	server.sent = []
	setActivePinia(createPinia())
	cart = usePOSCartStore()
})

describe("the note of the table, in the cart", () => {
	it("is the first note, with no name and no notes, on a new cart", () => {
		expect(cart.restaurantNote).toBe(1)
		expect(cart.restaurantNoteName).toBe("")
		expect(cart.noteAsk).toBeNull()
		// a table with no order yet: the one note is the new one
		expect(cart.restaurantNotes.map((one) => [one.note, Boolean(one.pending)])).toEqual([[1, true]])
	})

	it("is set to a rank from 1 to 99 and reads anything else as the first", () => {
		cart.setRestaurantNote(3)
		expect(cart.restaurantNote).toBe(3)

		for (const bad of [0, -1, 100, 2.5, "x", "", undefined, null]) {
			cart.setRestaurantNote(3)
			cart.setRestaurantNote(bad)
			expect(cart.restaurantNote, String(bad)).toBe(1)
		}
	})

	it("takes a rank written as text", () => {
		cart.setRestaurantNote("2")

		expect(cart.restaurantNote).toBe(2)
	})

	it("keeps the name trimmed, at most 60 characters, and nothing for what is no text", () => {
		cart.setRestaurantNoteName("   The   Dupont  family ")
		expect(cart.restaurantNoteName).toBe("The Dupont family")

		cart.setRestaurantNoteName("x".repeat(90))
		expect(cart.restaurantNoteName).toHaveLength(60)

		cart.setRestaurantNoteName(null)
		expect(cart.restaurantNoteName).toBe("")
	})

	it("holds the notes the server told, sorted by rank", () => {
		cart.setRestaurantNotes([note(2), note(1)])

		expect(cart.restaurantNotes.map((one) => one.note)).toEqual([1, 2])
		expect(cart.restaurantNotes.some((one) => one.pending)).toBe(false)
	})

	it("adds the new note to the server's notes while the server does not have it", () => {
		cart.setRestaurantNotes([note(1)])
		cart.setRestaurantNote(2)
		cart.setRestaurantNoteName("Martin")

		expect(cart.restaurantNotes.map((one) => [one.note, Boolean(one.pending)])).toEqual([
			[1, false],
			[2, true],
		])
		expect(cart.restaurantNotes[1].note_name).toBe("Martin")
	})

	it("stops adding it once the server has it", () => {
		cart.setRestaurantNote(2)
		cart.setRestaurantNotes([note(1), note(2)])

		expect(cart.restaurantNotes).toHaveLength(2)
		expect(cart.restaurantNotes.some((one) => one.pending)).toBe(false)
	})

	it("changes only the entry of the note it is told of, as a rename does", () => {
		cart.setRestaurantNotes([note(1), note(2)])

		cart.patchRestaurantNote(2, { note_name: "Dupont" })

		expect(cart.restaurantNotes.map((one) => one.note_name)).toEqual([null, "Dupont"])
	})

	it("is reset with the cart, and so are the notes and the question about them: the next table starts on its first note", async () => {
		cart.setRestaurantTable({ name: "T3" })
		cart.setRestaurantNotes([note(1), note(2)])
		cart.setRestaurantNote(2)
		cart.setRestaurantNoteName("Dupont")
		cart.noteAsk = { kind: "move", to: 1, count: 2 }

		await cart.clearCart()

		expect(cart.restaurantNote).toBe(1)
		expect(cart.restaurantNoteName).toBe("")
		expect(cart.noteAsk).toBeNull()
		expect(cart.restaurantNotes.map((one) => [one.note, Boolean(one.pending)])).toEqual([[1, true]])
	})
})

describe("the payload of every « Valider » (buildOfferEvaluationPayload, sent to update_invoice)", () => {
	beforeEach(() => {
		cart.setRestaurantTable({ name: "T3" })
		cart.addItem({ ...burger })
	})

	it("leaves the note out for a table with its one first note: it is saved exactly as before", () => {
		const payload = cart.buildOfferEvaluationPayload(PROFILE)

		expect(payload).not.toHaveProperty("restaurant_note")
		expect(payload).not.toHaveProperty("restaurant_note_name")
		expect(payload.restaurant_table).toBe("T3")
	})

	it("leaves it out for the first note of a table whose server notes are that one", () => {
		cart.setRestaurantNotes([note(1)])

		expect(cart.buildOfferEvaluationPayload(PROFILE)).not.toHaveProperty("restaurant_note")
	})

	it("carries the rank of any note when the table has several, the first included", () => {
		cart.setRestaurantNotes([note(1), note(2)])
		expect(cart.buildOfferEvaluationPayload(PROFILE).restaurant_note).toBe(1)

		cart.setRestaurantNote(2)
		expect(cart.buildOfferEvaluationPayload(PROFILE).restaurant_note).toBe(2)
	})

	it("carries the rank of a new note, which makes the table have two", () => {
		cart.setRestaurantNotes([note(1)])
		cart.setRestaurantNote(2)

		expect(cart.buildOfferEvaluationPayload(PROFILE).restaurant_note).toBe(2)
	})

	it("carries the rank of a note that is not the first even when it is the only one left, so it is not saved on the first", () => {
		cart.setRestaurantNotes([note(2)])
		cart.setRestaurantNote(2)

		expect(cart.buildOfferEvaluationPayload(PROFILE).restaurant_note).toBe(2)
	})

	it("carries the name of a note whose order does not exist yet, for the first save to keep", () => {
		cart.setRestaurantNotes([note(1)])
		cart.setRestaurantNote(2)
		cart.setRestaurantNoteName("Dupont")

		const payload = cart.buildOfferEvaluationPayload(PROFILE)

		expect(payload.restaurant_note).toBe(2)
		expect(payload.restaurant_note_name).toBe("Dupont")
	})

	it("does not carry the name once the order exists: a name changed later goes through its own call, and a stale one must not overwrite it", () => {
		cart.setRestaurantNotes([note(1), note(2)])
		cart.setRestaurantNote(2)
		cart.setRestaurantNoteName("Dupont")
		cart.$patch({ currentDraftId: "SINV-2" })

		const payload = cart.buildOfferEvaluationPayload(PROFILE)

		expect(payload.restaurant_note).toBe(2)
		expect(payload).not.toHaveProperty("restaurant_note_name")
	})

	it("carries no name that is empty", () => {
		cart.setRestaurantNotes([note(1)])
		cart.setRestaurantNote(2)
		cart.setRestaurantNoteName("   ")

		expect(cart.buildOfferEvaluationPayload(PROFILE)).not.toHaveProperty("restaurant_note_name")
	})

	it("carries the note in the payload of a send that decides nothing for the kitchen too", () => {
		cart.setRestaurantNotes([note(1), note(2)])
		cart.setRestaurantNote(2)

		expect(cart.buildOfferEvaluationPayload(PROFILE, { keepUndecided: true }).restaurant_note).toBe(2)
	})

	it("carries no note for a takeaway, which has no table", () => {
		cart.setRestaurantTable(null)
		cart.setRestaurantNote(2)

		expect(cart.buildOfferEvaluationPayload(PROFILE)).not.toHaveProperty("restaurant_note")
	})
})

describe("the payload of the payment (submitInvoice)", () => {
	beforeEach(() => {
		cart.setRestaurantTable({ name: "T3" })
		cart.addItem({ ...burger })
		cart.customer = "CUST-1"
	})

	it("leaves the note out for a table with its one first note", async () => {
		await cart.submitInvoice()

		expect(savedFirst()).not.toHaveProperty("restaurant_note")
		expect(submitted()).not.toHaveProperty("restaurant_note")
	})

	it("saves the draft it pays on the note in front of the waiter, so a second note is never paid onto the first one's draft", async () => {
		cart.setRestaurantNotes([note(1), note(2)])
		cart.setRestaurantNote(2)

		await cart.submitInvoice()

		expect(savedFirst().restaurant_note).toBe(2)
		expect(submitted().restaurant_note).toBe(2)
		expect(submitted().restaurant_table).toBe("T3")
	})

	it("pays the note it is the only one left of on its own rank", async () => {
		cart.setRestaurantNotes([note(2)])
		cart.setRestaurantNote(2)

		await cart.submitInvoice()

		expect(savedFirst().restaurant_note).toBe(2)
	})

	it("does not carry the name: the order exists by then", async () => {
		cart.setRestaurantNotes([note(1), note(2, { note_name: "Dupont" })])
		cart.setRestaurantNote(2)
		cart.setRestaurantNoteName("Dupont")

		await cart.submitInvoice()

		expect(savedFirst()).not.toHaveProperty("restaurant_note_name")
	})

	it("starts the next ticket on the first note: nothing of the paid note stays in the cart", async () => {
		cart.setRestaurantNotes([note(1), note(2)])
		cart.setRestaurantNote(2)
		await cart.submitInvoice()
		await cart.clearCart({ returnSerials: false })
		cart.addItem({ ...burger })
		cart.customer = "CUST-2"

		await cart.submitInvoice()

		expect(submitted()).not.toHaveProperty("restaurant_note")
	})
})

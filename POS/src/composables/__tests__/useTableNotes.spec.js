/**
 * //// Neoffice — added file (no upstream equivalent). The waiter's gestures on the notes of a table (NeoResto lot 1, notes: « table 5, .1, .2, .3 »), with the real cart and the real way a table is opened, the server's answers
 * //// played by a script. Tapping another note reads it; with lines NOT SENT in the cart it first asks « Move the N new lines to .1? » — « Move them » carries those lines to the other note, « Keep them on .0 » changes nothing,
 * //// and the lines already SENT to the kitchen never move; a dish taken off after it was sent keeps the waiter on the note; « ＋ » opens a new note (the next rank after the highest) that the server does not have until its
 * //// first « Valider »; a group is named on the server when its order exists, in the cart when it does not.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => ({ calls: [], fail: null, orders: {}, rename: null }))
const toast = vi.hoisted(() => ({ showError: vi.fn(), showWarning: vi.fn() }))

vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? `${s} ${args.join(" ")}` : s)
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({})),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		server.calls.push([method.split(".").pop(), args])
		const name = method.split(".").pop()
		if (server.fail === name) throw new Error("refused")
		if (name === "open_table") return server.orders[args.note ?? "lowest"]
		if (name === "set_table_note_name") return server.rename ? server.rename(args) : { note_name: args.note_name || null }
		return {}
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showInfo: vi.fn(), ...toast }),
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till" }) }))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ askCoversOnOpen: false }),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }))

const { useOpenTable } = await import("@/composables/useOpenTable")
const { useTableNotes } = await import("../useTableNotes")
const { usePOSCartStore } = await import("@/stores/posCart")

const TABLE = { name: "t5", table_name: "Table 5", status: "Occupied", capacity: 4 }
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
const SUMMARIES = [summary(1, { note_name: "Dupont" }), summary(2)]
const sentLine = (code) => ({ item_code: code, item_name: code, qty: 1, rate: 5, uom: "Unit", kds_status: "Pending" })

let cart
let notes
const dish = (code) => ({ item_code: code, item_name: code, rate: 5, price_list_rate: 5, uom: "Unit", stock_uom: "Unit", conversion_factor: 1 })
const codes = () => cart.invoiceItems.map((line) => line.item_code)
const calls = (name) => server.calls.filter(([called]) => called === name)

// The table opened on its first note, as a tap on the plan does it; the second note exists on the server
async function openOnTheFirstNote() {
	server.orders.lowest = { name: "SINV-1", items: [sentLine("soup")], note: 1, note_name: "Dupont", notes: SUMMARIES }
	server.orders[2] = { name: "SINV-2", items: [sentLine("wine")], note: 2, note_name: null, notes: SUMMARIES }
	server.orders[3] = { is_new: true, note: 3, note_name: null, notes: SUMMARIES }
	await useOpenTable().openTable(TABLE)
	server.calls = []
}

beforeEach(async () => {
	setActivePinia(createPinia())
	cart = usePOSCartStore()
	server.calls = []
	server.fail = null
	server.orders = {}
	server.rename = null
	toast.showError.mockClear()
	toast.showWarning.mockClear()
	notes = useTableNotes()
})

describe("what the header draws of the notes", () => {
	it("is a table with one note: « Table 5 », no row of pills, and the discreet « ＋ Group »", async () => {
		server.orders.lowest = { name: "SINV-1", items: [sentLine("soup")], note: 1, notes: [summary(1)] }
		await useOpenTable().openTable(TABLE)

		expect(notes.label.value).toBe("Table 5")
		expect(notes.showPills.value).toBe(false)
		expect(notes.showAddGroup.value).toBe(true)
	})

	it("is a table with two notes: « Table 5.0 · Dupont », the row of pills and no « ＋ Group »", async () => {
		await openOnTheFirstNote()

		expect(notes.label.value).toBe("Table 5.0 · Dupont")
		expect(notes.showPills.value).toBe(true)
		expect(notes.showAddGroup.value).toBe(false)
		expect(notes.pills.value.map((pill) => [pill.label, pill.current])).toEqual([
			[".0", true],
			[".1", false],
		])
	})

	it("offers no « ＋ Group » on a table whose order is not saved yet: there is nothing to group", async () => {
		server.orders.lowest = { is_new: true, note: 1, notes: [] }
		await useOpenTable().openTable(TABLE)

		expect(notes.showAddGroup.value).toBe(false)
		expect(notes.canAdd.value).toBe(false)
	})

	it("draws nothing for a takeaway", async () => {
		await cart.clearCart()
		cart.$patch({ isTakeaway: true, takeawayNumber: "T-1" })

		expect(notes.pills.value).toEqual([])
		expect(notes.showPills.value).toBe(false)
		expect(notes.showAddGroup.value).toBe(false)
	})
})

describe("tapping another note with no line to move", () => {
	it("reads the other note and puts it in the cart", async () => {
		await openOnTheFirstNote()

		const opened = await notes.select(2)

		expect(opened).toBe(true)
		expect(calls("open_table")).toEqual([["open_table", { table_name: "t5", pos_profile: "Till", note: 2 }]])
		expect(cart.restaurantNote).toBe(2)
		expect(codes()).toEqual(["wine"])
		expect(cart.currentDraftId).toBe("SINV-2")
		expect(notes.label.value).toBe("Table 5.1")
		expect(cart.noteAsk).toBeNull()
	})

	it("does nothing for the note already in front of the waiter", async () => {
		await openOnTheFirstNote()

		expect(await notes.select(1)).toBe(false)
		expect(server.calls).toEqual([])
	})

	it("leaves the waiter where he was, and says so, when the other note cannot be read", async () => {
		await openOnTheFirstNote()
		server.fail = "open_table"
		const log = vi.spyOn(console, "error").mockImplementation(() => {})

		const opened = await notes.select(2)

		expect(opened).toBe(false)
		expect(cart.restaurantNote).toBe(1)
		expect(codes()).toEqual(["soup"])
		expect(toast.showError).toHaveBeenCalledWith("Failed to open the group")
		log.mockRestore()
	})

	it("does not answer a second tap while a note is being opened", async () => {
		await openOnTheFirstNote()

		const first = notes.select(2)
		const second = await notes.select(2)
		await first

		expect(second).toBe(false)
		expect(calls("open_table")).toHaveLength(1)
	})
})

describe("tapping another note with lines not sent in the cart", () => {
	it("asks « Move the N new lines to .1? » and changes nothing yet", async () => {
		await openOnTheFirstNote()
		cart.addItem(dish("beer"), 2)
		cart.addItem(dish("fries"), 1)

		const opened = await notes.select(2)

		expect(opened).toBe(false)
		expect(server.calls).toEqual([])
		expect(cart.noteAsk).toEqual({ kind: "move", to: 2, count: 2 })
		expect(notes.moveAsk.value.count).toBe(2)
		expect(notes.fromLabel.value).toBe(".0")
		expect(notes.toLabel.value).toBe(".1")
		expect(cart.restaurantNote).toBe(1)
		expect(codes()).toEqual(["soup", "beer", "fries"])
	})

	it("« Move them » carries the new lines to the other note, which keeps its own lines", async () => {
		await openOnTheFirstNote()
		cart.addItem(dish("beer"), 2)
		await notes.select(2)

		const moved = await notes.moveThem()

		expect(moved).toBe(true)
		expect(cart.restaurantNote).toBe(2)
		expect(codes()).toEqual(["wine", "beer"])
		expect(cart.invoiceItems.find((line) => line.item_code === "beer")).toMatchObject({ quantity: 2 })
		expect(cart.noteAsk).toBeNull()
	})

	it("carries the lines as lines NOT sent on the other note, so that its next « Valider » sends them", async () => {
		await openOnTheFirstNote()
		cart.addItem(dish("beer"), 1)
		await notes.select(2)
		await notes.moveThem()

		const beer = cart.invoiceItems.find((line) => line.item_code === "beer")
		const wine = cart.invoiceItems.find((line) => line.item_code === "wine")

		expect(beer.kds_status).toBeFalsy()
		expect(wine.kds_status).toBe("Pending")
	})

	it("never moves a line already sent to the kitchen, and saves nothing of the note it leaves", async () => {
		await openOnTheFirstNote()
		cart.addItem(dish("beer"), 1)
		await notes.select(2)
		await notes.moveThem()

		expect(codes()).not.toContain("soup")
		expect(calls("update_invoice")).toEqual([])
		expect(calls("open_table")).toEqual([["open_table", { table_name: "t5", pos_profile: "Till", note: 2 }]])
	})

	it("« Keep them on .0 » changes nothing: the waiter stays with his lines and the server is not asked", async () => {
		await openOnTheFirstNote()
		cart.addItem(dish("beer"), 1)
		await notes.select(2)

		notes.keepThem()

		expect(cart.noteAsk).toBeNull()
		expect(server.calls).toEqual([])
		expect(cart.restaurantNote).toBe(1)
		expect(codes()).toEqual(["soup", "beer"])
	})

	it("keeps the question open and the lines in the cart when the other note cannot be read", async () => {
		await openOnTheFirstNote()
		cart.addItem(dish("beer"), 1)
		await notes.select(2)
		server.fail = "open_table"
		const log = vi.spyOn(console, "error").mockImplementation(() => {})

		const moved = await notes.moveThem()

		expect(moved).toBe(false)
		expect(cart.noteAsk).toEqual({ kind: "move", to: 2, count: 1 })
		expect(codes()).toEqual(["soup", "beer"])
		expect(cart.restaurantNote).toBe(1)
		log.mockRestore()
	})

	it("counts a line held back by the waiter (« Waiting ») as sent: it was saved with the order and stays", async () => {
		server.orders.lowest = {
			name: "SINV-1",
			items: [sentLine("soup"), { ...sentLine("steak"), kds_status: "Waiting" }],
			note: 1,
			notes: SUMMARIES,
		}
		server.orders[2] = { name: "SINV-2", items: [], note: 2, notes: SUMMARIES }
		await useOpenTable().openTable(TABLE)
		server.calls = []

		const opened = await notes.select(2)

		expect(opened).toBe(true)
		expect(cart.noteAsk).toBeNull()
	})

	it("answers « Move them » for a question that is not there with nothing", async () => {
		await openOnTheFirstNote()

		expect(await notes.moveThem()).toBe(false)
		expect(server.calls).toEqual([])
	})
})

describe("tapping another note after a dish that had left was taken off", () => {
	it("keeps the waiter where he is and tells him to send the cancellation or put the dish back", async () => {
		await openOnTheFirstNote()
		cart.removeItem("soup")
		expect(cart.removedSentLines.length).toBe(1)

		const opened = await notes.select(2)

		expect(opened).toBe(false)
		expect(server.calls).toEqual([])
		expect(cart.noteAsk).toBeNull()
		expect(toast.showWarning).toHaveBeenCalledWith("Send the cancellation or put the dish back before changing group")
	})
})

describe("adding a group", () => {
	it("opens a new empty note after the table's highest, which the server does not have yet", async () => {
		await openOnTheFirstNote()

		const opened = await notes.add()

		expect(opened).toBe(true)
		expect(calls("open_table")).toEqual([["open_table", { table_name: "t5", pos_profile: "Till", note: 3 }]])
		expect(cart.restaurantNote).toBe(3)
		expect(cart.currentDraftId).toBeNull()
		expect(codes()).toEqual([])
		expect(notes.pills.value.map((pill) => [pill.label, pill.pending])).toEqual([
			[".0", false],
			[".1", false],
			[".2", true],
		])
		expect(notes.label.value).toBe("Table 5.2")
	})

	it("makes the second note of a table that had one", async () => {
		server.orders.lowest = { name: "SINV-1", items: [sentLine("soup")], note: 1, notes: [summary(1)] }
		server.orders[2] = { is_new: true, note: 2, notes: [summary(1)] }
		await useOpenTable().openTable(TABLE)
		server.calls = []

		await notes.add()

		expect(calls("open_table")[0][1].note).toBe(2)
		expect(cart.restaurantNote).toBe(2)
		expect(notes.showPills.value).toBe(true)
		expect(notes.label.value).toBe("Table 5.1")
	})

	it("asks to move the lines not sent first, as a tap on another note does", async () => {
		await openOnTheFirstNote()
		cart.addItem(dish("beer"), 1)

		const opened = await notes.add()

		expect(opened).toBe(false)
		expect(cart.noteAsk).toEqual({ kind: "move", to: 3, count: 1 })
		await notes.moveThem()
		expect(cart.restaurantNote).toBe(3)
		expect(codes()).toEqual(["beer"])
	})

	it("does nothing on a table whose order is not saved yet", async () => {
		server.orders.lowest = { is_new: true, note: 1, notes: [] }
		await useOpenTable().openTable(TABLE)
		server.calls = []

		expect(await notes.add()).toBe(false)
		expect(server.calls).toEqual([])
	})

	it("does nothing on a note that is itself new: it is already the empty one", async () => {
		await openOnTheFirstNote()
		await notes.add()
		server.calls = []

		expect(await notes.add()).toBe(false)
		expect(server.calls).toEqual([])
	})
})

describe("naming a group", () => {
	it("asks for the name of the note in front of the waiter, or of the one long-pressed", async () => {
		await openOnTheFirstNote()

		notes.askName()
		expect(cart.noteAsk).toEqual({ kind: "name", rank: 1 })
		expect(notes.namedPill.value).toMatchObject({ label: ".0", name: "Dupont" })

		notes.askName(2)
		expect(cart.noteAsk).toEqual({ kind: "name", rank: 2 })
	})

	it("asks nothing for a note the table does not have", async () => {
		await openOnTheFirstNote()

		notes.askName(9)

		expect(cart.noteAsk).toBeNull()
	})

	it("saves the name on the server when the group's order exists, and shows it", async () => {
		await openOnTheFirstNote()
		notes.askName(1)

		const saved = await notes.saveName("  Les   Martin ")

		expect(saved).toBe(true)
		expect(calls("set_table_note_name")).toEqual([["set_table_note_name", { invoice: "SINV-1", note_name: "Les Martin" }]])
		expect(cart.restaurantNoteName).toBe("Les Martin")
		expect(notes.pills.value[0].name).toBe("Les Martin")
		expect(notes.label.value).toBe("Table 5.0 · Les Martin")
		expect(cart.noteAsk).toBeNull()
	})

	it("takes the name off when the field is emptied", async () => {
		await openOnTheFirstNote()
		notes.askName(1)

		await notes.saveName("   ")

		expect(calls("set_table_note_name")[0][1]).toEqual({ invoice: "SINV-1", note_name: "" })
		expect(cart.restaurantNoteName).toBe("")
		expect(notes.pills.value[0].name).toBe("")
	})

	it("names another group of the table without leaving the note in front of the waiter", async () => {
		await openOnTheFirstNote()
		notes.askName(2)

		await notes.saveName("Martin")

		expect(calls("set_table_note_name")[0][1]).toEqual({ invoice: "SINV-2", note_name: "Martin" })
		expect(cart.restaurantNote).toBe(1)
		expect(cart.restaurantNoteName).toBe("Dupont")
		expect(notes.pills.value.map((pill) => pill.name)).toEqual(["Dupont", "Martin"])
	})

	it("keeps the name of a group not saved yet in the cart, with no call: its first « Valider » carries it", async () => {
		await openOnTheFirstNote()
		await notes.add()
		server.calls = []
		notes.askName()

		const saved = await notes.saveName("Jules")

		expect(saved).toBe(true)
		expect(server.calls).toEqual([])
		expect(cart.restaurantNoteName).toBe("Jules")
		expect(notes.label.value).toBe("Table 5.2 · Jules")
	})

	it("keeps the question open and the old name when the server refuses", async () => {
		await openOnTheFirstNote()
		notes.askName(1)
		server.fail = "set_table_note_name"
		const log = vi.spyOn(console, "error").mockImplementation(() => {})

		const saved = await notes.saveName("Martin")

		expect(saved).toBe(false)
		expect(cart.noteAsk).toEqual({ kind: "name", rank: 1 })
		expect(cart.restaurantNoteName).toBe("Dupont")
		expect(toast.showError).toHaveBeenCalledWith("Failed to save the name of the group")
		log.mockRestore()
	})

	it("changes nothing when the table was left while the server answered", async () => {
		await openOnTheFirstNote()
		notes.askName(1)
		server.rename = (args) => {
			cart.noteAsk = null
			return { note_name: args.note_name }
		}

		const saved = await notes.saveName("Martin")

		expect(saved).toBe(false)
		expect(cart.restaurantNoteName).toBe("Dupont")
	})

	it("closes the question on « Cancel » and changes nothing", async () => {
		await openOnTheFirstNote()
		notes.askName(1)

		notes.cancelName()

		expect(cart.noteAsk).toBeNull()
		expect(server.calls).toEqual([])
	})
})

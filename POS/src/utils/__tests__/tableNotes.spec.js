/**
 * //// Neoffice — added file (no upstream equivalent). The notes of a table (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): a note is told apart by its rank (1 to 99, an unset one is the first) and, if the waiter wants, by a
 * //// name (at most 60 characters); a table with one note stays « Table 5 » and « Table 5.2 · Dupont » appears only when it has a second; a new note takes the rank after the table's highest; the order payload carries the rank
 * //// only when the table has several notes or the note is not the first; the pills of the header are the server's notes plus the new one, the current one carrying the cart's live figures; a table is found by its label or by
 * //// the name of one of its groups.
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

const {
	NOTE_MAX,
	NOTE_NAME_MAX,
	cleanNoteName,
	effectiveRank,
	isRank,
	isTheLowestNote,
	nextFreeRank,
	normalizeNotes,
	noteParts,
	notePayload,
	notePills,
	orderTableLabel,
	orderTableParts,
	rankLabel,
	tableLabel,
	tableMatchesSearch,
	tableNotesInfo,
	withPendingNote,
} = await import("../tableNotes")

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

describe("the rank of a note", () => {
	it("is a whole number from 1 to 99", () => {
		expect(NOTE_MAX).toBe(99)
		expect(isRank(1)).toBe(true)
		expect(isRank(99)).toBe(true)
		for (const bad of [0, 100, -1, 2.5, "2", null, undefined, Number.NaN])
			expect(isRank(bad), String(bad)).toBe(false)
	})

	it("reads an unset or invalid rank as the first note, a legacy order stored with 0 included", () => {
		for (const unset of [undefined, null, "", 0, -3, 100, 2.5, "x", {}])
			expect(effectiveRank(unset), String(unset)).toBe(1)
	})

	it("keeps a real rank, written as text too", () => {
		expect(effectiveRank(2)).toBe(2)
		expect(effectiveRank("3")).toBe(3)
		expect(effectiveRank(" 4 ")).toBe(4)
	})

	it("is said with a dot", () => {
		expect(rankLabel(2)).toBe(".2")
		expect(rankLabel(undefined)).toBe(".1")
	})
})

describe("the name of a note", () => {
	it("is trimmed and its inner spaces are collapsed", () => {
		expect(cleanNoteName("  The   two   couples ")).toBe("The two couples")
	})

	it("is cut to 60 characters", () => {
		expect(NOTE_NAME_MAX).toBe(60)
		expect(cleanNoteName("x".repeat(80))).toHaveLength(60)
		expect(cleanNoteName(`${"x".repeat(59)} yyyy`)).toBe("x".repeat(59))
	})

	it("is nothing when it is no text", () => {
		for (const bad of [null, undefined, 5, {}, [], "", "   "])
			expect(cleanNoteName(bad), String(bad)).toBe("")
	})
})

describe("the notes the server answered", () => {
	it("are cleaned, one per rank, sorted by rank", () => {
		const notes = normalizeNotes([
			note(3),
			note(1, { note_name: "  Dupont " }),
			note(1, { note_name: "Duplicate" }),
			null,
			"junk",
			note(2, { covers: 3, grand_total: "45.5", items_count: "4" }),
		])

		expect(notes.map((one) => one.note)).toEqual([1, 2, 3])
		expect(notes[0].note_name).toBe("Dupont")
		expect(notes[1]).toMatchObject({ covers: 3, grand_total: 45.5, items_count: 4 })
	})

	it("read a note with no rank as the first and covers that are no number of people as none", () => {
		const [one] = normalizeNotes([{ name: "SINV-1", note: 0, covers: 0 }])

		expect(one.note).toBe(1)
		expect(one.covers).toBeNull()
	})

	it("are none when the answer is no list", () => {
		for (const bad of [undefined, null, {}, "x", 5]) expect(normalizeNotes(bad)).toEqual([])
	})
})

describe("a new note", () => {
	it("is added to the server's notes while the server does not have it", () => {
		const notes = withPendingNote([note(1)], 2, "Martin")

		expect(notes.map((one) => [one.note, Boolean(one.pending)])).toEqual([
			[1, false],
			[2, true],
		])
		expect(notes[1]).toMatchObject({ name: null, note_name: "Martin" })
	})

	it("is not added when the server already has that rank", () => {
		const notes = withPendingNote([note(1), note(2)], 2)

		expect(notes).toHaveLength(2)
		expect(notes.some((one) => one.pending)).toBe(false)
	})

	it("stays marked pending when its list goes through again, as the cart's list does on its way to the pills", () => {
		const once = withPendingNote([note(1)], 2, "Martin")
		const twice = withPendingNote(once, 2, "Martin")

		expect(twice.map((one) => [one.note, Boolean(one.pending)])).toEqual([
			[1, false],
			[2, true],
		])
		expect(notePills(once, { rank: 2 })[1].pending).toBe(true)
	})

	it("is the first note of a table with no order yet", () => {
		const notes = withPendingNote([], 1)

		expect(notes).toHaveLength(1)
		expect(notes[0]).toMatchObject({ note: 1, pending: true })
	})

	it("takes the rank after the table's highest, so that a group keeps its number", () => {
		expect(nextFreeRank([1])).toBe(2)
		expect(nextFreeRank([1, 2])).toBe(3)
		// the first group was paid and left: the new one is not called .1 again
		expect(nextFreeRank([2])).toBe(3)
		expect(nextFreeRank([1, 3])).toBe(4)
		expect(nextFreeRank([])).toBe(1)
	})

	it("takes the smallest free rank once the highest is the last possible, and none when all are taken", () => {
		expect(nextFreeRank([1, 99])).toBe(2)
		expect(nextFreeRank(Array.from({ length: 99 }, (_, at) => at + 1))).toBeNull()
	})
})

describe("how a table is named", () => {
	it("stays « Table 5 » with one note, whatever its rank and name", () => {
		expect(noteParts("Table 5", { rank: 2, name: "Dupont", count: 1 })).toEqual({ title: "Table 5", name: "" })
		expect(tableLabel("Table 5", { rank: 1, name: "", count: 1 })).toBe("Table 5")
		expect(tableLabel("Table 5")).toBe("Table 5")
	})

	it("is « Table 5.2 » from the second note on, the name apart", () => {
		expect(noteParts("Table 5", { rank: 2, name: "Dupont", count: 2 })).toEqual({ title: "Table 5.2", name: "Dupont" })
		expect(noteParts("Table 5", { rank: 1, count: 2 })).toEqual({ title: "Table 5.1", name: "" })
	})

	it("is written in one string with the name after a dot", () => {
		expect(tableLabel("Table 5", { rank: 2, name: "Dupont", count: 3 })).toBe("Table 5.2 · Dupont")
		expect(tableLabel("Table 5", { rank: 2, count: 3 })).toBe("Table 5.2")
	})

	it("is the table's name as a kitchen order says it, with the group when the table has several", () => {
		const order = { table_display_name: "Table 5", restaurant_table: "t5", note: 2, note_name: "Dupont", notes_count: 2 }

		expect(orderTableParts(order)).toEqual({ title: "Table 5.2", name: "Dupont" })
		expect(orderTableLabel(order)).toBe("Table 5.2 · Dupont")
	})

	it("is unchanged for an order of a table with one note, or an order that says nothing of notes", () => {
		expect(orderTableParts({ table_display_name: "Table 5", note: 1, notes_count: 1 })).toEqual({ title: "Table 5", name: "" })
		expect(orderTableParts({ restaurant_table: "t5" })).toEqual({ title: "t5", name: "" })
		expect(orderTableLabel({ table_display_name: "Table 5" })).toBe("Table 5")
		expect(orderTableParts({})).toEqual({ title: "", name: "" })
	})
})

describe("the pills of the header", () => {
	it("are one per note, sorted by rank, the current one marked", () => {
		const pills = notePills([note(2), note(1, { note_name: "Dupont" })], { rank: 2 })

		expect(pills.map((pill) => [pill.label, pill.name, pill.current, pill.pending])).toEqual([
			[".1", "Dupont", false, false],
			[".2", "", true, false],
		])
		expect(pills[0].text).toBe(".1 Dupont")
		expect(pills[1].text).toBe(".2")
		expect(pills[0].invoice).toBe("SINV-1")
	})

	it("carry the live figures of the current note and the server's for the others", () => {
		const pills = notePills(
			[note(1, { covers: 2, grand_total: 30, items_count: 3 }), note(2, { covers: 4, grand_total: 10, items_count: 1 })],
			{ rank: 1, name: "Live", covers: 5, total: 99, lines: 7 },
		)

		expect(pills[0]).toMatchObject({ name: "Live", covers: 5, total: 99, lines: 7 })
		expect(pills[1]).toMatchObject({ covers: 4, total: 10, lines: 1 })
	})

	it("have the new note, which the server does not have yet, as a pending pill that is the current one", () => {
		const pills = notePills([note(1)], { rank: 2, name: "Martin" })

		expect(pills).toHaveLength(2)
		expect(pills[1]).toMatchObject({ rank: 2, current: true, pending: true, name: "Martin", invoice: null })
	})

	it("are a single one for a table with one note, so that no row is drawn", () => {
		expect(notePills([note(1)], { rank: 1 })).toHaveLength(1)
		expect(notePills([], { rank: 1 })).toHaveLength(1)
	})
})

describe("the lowest note", () => {
	it("is the one a guest's order attaches to", () => {
		expect(isTheLowestNote([note(1), note(2)], 1)).toBe(true)
		expect(isTheLowestNote([note(1), note(2)], 2)).toBe(false)
		expect(isTheLowestNote([note(2), note(3)], 2)).toBe(true)
	})

	it("is not a new note the server does not have", () => {
		expect(isTheLowestNote([note(2)], 1)).toBe(false)
	})

	it("is anyone's when the server has no note at all", () => {
		expect(isTheLowestNote([], 1)).toBe(true)
		expect(isTheLowestNote(undefined, 3)).toBe(true)
	})
})

describe("what an order payload carries of the note", () => {
	const table = { name: "t5" }

	it("is nothing for a table with its one first note: it is saved exactly as before", () => {
		expect(notePayload({ table, rank: 1, notes: [] })).toEqual({})
		expect(notePayload({ table, rank: 1, notes: [note(1)] })).toEqual({})
		expect(notePayload({ table, rank: undefined })).toEqual({})
	})

	it("is the rank when the table has several notes, even for the first", () => {
		expect(notePayload({ table, rank: 1, notes: [note(1), note(2)] })).toEqual({ restaurant_note: 1 })
		expect(notePayload({ table, rank: 2, notes: [note(1), note(2)] })).toEqual({ restaurant_note: 2 })
	})

	it("is the rank for a new note, which makes the table have two", () => {
		expect(notePayload({ table, rank: 2, notes: [note(1)] })).toEqual({ restaurant_note: 2 })
	})

	it("is the rank of a note that is not the first even when it is alone: it must not be saved on the first", () => {
		expect(notePayload({ table, rank: 2, notes: [note(2)] })).toEqual({ restaurant_note: 2 })
	})

	it("carries the name only when asked and only when there is one", () => {
		const two = [note(1), note(2)]

		expect(notePayload({ table, rank: 2, name: "Dupont", notes: two })).toEqual({ restaurant_note: 2 })
		expect(notePayload({ table, rank: 2, name: "  Dupont ", notes: two, withName: true })).toEqual({
			restaurant_note: 2,
			restaurant_note_name: "Dupont",
		})
		expect(notePayload({ table, rank: 2, name: "  ", notes: two, withName: true })).toEqual({ restaurant_note: 2 })
	})

	it("is nothing for a counter sale or a takeaway, which have no table", () => {
		expect(notePayload({ table: null, rank: 2, name: "Dupont", notes: [note(1)], withName: true })).toEqual({})
	})
})

describe("the notes of a table on the floor", () => {
	it("are counted and named by the order summary", () => {
		const table = { order_summary: { notes_count: 2, note_names: ["Dupont", " Martin ", "", 5] } }

		expect(tableNotesInfo(table)).toEqual({ count: 2, names: ["Dupont", "Martin"] })
	})

	it("are none for a table with no order, or a summary that says nothing", () => {
		expect(tableNotesInfo({ order_summary: null })).toEqual({ count: 0, names: [] })
		expect(tableNotesInfo({ order_summary: { item_count: 3 } })).toEqual({ count: 0, names: [] })
		expect(tableNotesInfo(undefined)).toEqual({ count: 0, names: [] })
	})
})

describe("the search of a table", () => {
	const table = { name: "t5", table_name: "Table 5", order_summary: { notes_count: 2, note_names: ["Dupont", "Les Müller"] } }

	it("keeps every table when nothing is typed", () => {
		for (const empty of ["", "   ", null, undefined]) expect(tableMatchesSearch(table, empty)).toBe(true)
	})

	it("finds a table by its label and by the name of one of its groups", () => {
		expect(tableMatchesSearch(table, "table 5")).toBe(true)
		expect(tableMatchesSearch(table, "dupont")).toBe(true)
		expect(tableMatchesSearch(table, "mül")).toBe(true)
	})

	it("ignores capitals and accents", () => {
		expect(tableMatchesSearch(table, "DUPONT")).toBe(true)
		expect(tableMatchesSearch(table, "muller")).toBe(true)
		expect(tableMatchesSearch({ table_name: "Terrasse été" }, "ete")).toBe(true)
	})

	it("needs every word typed", () => {
		expect(tableMatchesSearch(table, "dupont table")).toBe(true)
		expect(tableMatchesSearch(table, "dupont terrace")).toBe(false)
	})

	it("does not find a table by a name none of its groups has", () => {
		expect(tableMatchesSearch(table, "martin")).toBe(false)
		expect(tableMatchesSearch({ table_name: "Table 6", order_summary: null }, "dupont")).toBe(false)
	})
})

//// Neoffice — added file (no upstream equivalent). The groups of a table on the list of tables (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): the order summary the floor reads is the SUM of the table's open notes and says
//// how many there are (`notes_count`) and the names they were given (`note_names`); the list carries both on the table's entry, and a search finds a table by its label or by the name of one of its groups (« Dupont » finds
//// « Table 5 »). The search narrows the tables shown, not the count of « All · N » nor the free tables of « Open a table ».
import { describe, expect, it } from "vitest"

globalThis.__ = (text, args) => (args || []).reduce((s, arg, at) => s.replace(`{${at}}`, arg), text)

const { tablesOfTheService, ALL_ROOMS } = await import("../tablesOfTheService.js")

const ROOM = { name: "r00m1h4sh", area_name: "Salle 1" }
const NOW = new Date(Date.UTC(2026, 9, 31, 18, 58, 0))
const summary = (extra = {}) => ({
	item_count: 5,
	opened_at: "2026-10-31 19:00:00.000000",
	opened_by: "LM",
	grand_total: 80,
	...extra,
})
const table = (name, label, status = "Empty", extra = {}) => ({
	name,
	table_name: label,
	area: ROOM.name,
	status,
	capacity: 4,
	waiting_items_count: 0,
	qr_waiting_count: 0,
	order_summary: status === "Occupied" ? summary() : null,
	...extra,
})

const TABLES = [
	table("t5", "Table 5", "Occupied", { order_summary: summary({ notes_count: 2, note_names: ["Dupont", "Les Martin"] }) }),
	table("t6", "Table 6", "Occupied", { order_summary: summary({ notes_count: 1, note_names: [] }) }),
	table("t7", "Table 7", "Occupied"),
	table("t8", "Table 8", "Empty"),
	table("t9", "Terrasse 9", "Empty"),
]
const service = (extra = {}) =>
	tablesOfTheService({ tables: TABLES, areas: [ROOM], now: NOW, timezone: "Europe/Zurich", room: ALL_ROOMS, ...extra })
const titles = (entries) => entries.map((entry) => entry.title)

describe("the groups of a table, on its entry of the list", () => {
	it("are counted and named from the order summary", () => {
		const entry = service().busy.find((one) => one.title === "Table 5")

		expect(entry.notesCount).toBe(2)
		expect(entry.noteNames).toEqual(["Dupont", "Les Martin"])
	})

	it("are one for a table with one note, and none are named", () => {
		const entry = service().busy.find((one) => one.title === "Table 6")

		expect(entry.notesCount).toBe(1)
		expect(entry.noteNames).toEqual([])
	})

	it("are none for a summary that says nothing of notes, and for a table with no order", () => {
		const list = service()

		expect(list.busy.find((one) => one.title === "Table 7")).toMatchObject({ notesCount: 0, noteNames: [] })
		expect(list.others.find((one) => one.title === "Table 8")).toMatchObject({ notesCount: 0, noteNames: [] })
	})

	it("do not change what the entry said before: the total is the summary's", () => {
		const entry = service().busy.find((one) => one.title === "Table 5")

		expect(entry.total).toBe(80)
		expect(entry.tier).toBe("occupied")
	})
})

describe("the search of a table", () => {
	it("keeps every table when nothing is typed", () => {
		const everyone = service()

		expect(service({ search: "" }).busy).toHaveLength(everyone.busy.length)
		expect(service({ search: "   " }).others).toHaveLength(everyone.others.length)
	})

	it("finds a table by the name of one of its groups", () => {
		const list = service({ search: "dupont" })

		expect(titles(list.busy)).toEqual(["Table 5"])
		expect(list.others).toEqual([])
	})

	it("finds a table by its label, the tables in service and the other ones alike", () => {
		expect(titles(service({ search: "table 8" }).others)).toEqual(["Table 8"])
		expect(titles(service({ search: "table" }).busy)).toEqual(["Table 5", "Table 6", "Table 7"])
	})

	it("ignores capitals and accents", () => {
		expect(titles(service({ search: "MARTIN" }).busy)).toEqual(["Table 5"])
		expect(titles(service({ search: "terrasse" }).others)).toEqual(["Terrasse 9"])
	})

	it("finds nothing for a name no table has", () => {
		const list = service({ search: "nobody" })

		expect(list.busy).toEqual([])
		expect(list.others).toEqual([])
	})

	it("does not narrow the count of « All · N » nor the free tables of « Open a table »", () => {
		const list = service({ search: "dupont" })
		const all = service()

		expect(list.activeCount).toBe(all.activeCount)
		expect(list.free.map((one) => one.name)).toEqual(all.free.map((one) => one.name))
	})
})

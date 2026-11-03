/**
 * //// Neoffice — added file (no upstream equivalent). What the Printing settings save (Daniel, 02.11.2026: a station may work on paper alone): only what
 * //// differs from what the screen read, the stations that work on paper alone among it.
 */
import { describe, expect, it } from "vitest"
import { printingChangesOf } from "../printingChanges"

const READ = {
	receipt_printer: "P1",
	auto_print: 0,
	open_drawer: "Cash payments",
	stationPrinters: { Kitchen: "P1", Bar: null },
	stationPaperOnly: { Kitchen: 0, Bar: 0 },
	stationTextSize: { Kitchen: "Medium", Bar: "Medium" },
}
const SAME = { receipt_printer: "P1", auto_print: 0, open_drawer: "Cash payments", stations: {}, paper_only: {}, text_size: {} }

describe("what the printing settings save", () => {
	it("saves nothing when nothing differs", () => {
		expect(printingChangesOf(READ, SAME)).toBeNull()
		expect(printingChangesOf(null, SAME)).toBeNull()
	})

	it("saves a station set to work on paper alone", () => {
		const changes = printingChangesOf(READ, { ...SAME, paper_only: { Kitchen: 1 } })

		expect(changes.paper_only).toEqual({ Kitchen: 1 })
		expect(changes.stations).toBeUndefined()
		expect(changes.receipt_printer).toBe("P1")
	})

	it("does not save a station left as it was", () => {
		expect(printingChangesOf(READ, { ...SAME, paper_only: { Kitchen: 0 } })).toBeNull()
		expect(printingChangesOf({ ...READ, stationPaperOnly: { Kitchen: 1 } }, { ...SAME, paper_only: { Kitchen: 1 } })).toBeNull()
	})

	it("saves a station given back its screen", () => {
		const changes = printingChangesOf({ ...READ, stationPaperOnly: { Kitchen: 1 } }, { ...SAME, paper_only: { Kitchen: 0 } })

		expect(changes.paper_only).toEqual({ Kitchen: 0 })
	})

	it("saves the printer of a station and its paper-only flag together", () => {
		const changes = printingChangesOf(READ, { ...SAME, stations: { Bar: "P1" }, paper_only: { Bar: 1 } })

		expect(changes.stations).toEqual({ Bar: "P1" })
		expect(changes.paper_only).toEqual({ Bar: 1 })
	})

	it("saves the size of the writing of a station's tickets", () => {
		const changes = printingChangesOf(READ, { ...SAME, text_size: { Kitchen: "Small" } })

		expect(changes.text_size).toEqual({ Kitchen: "Small" })
		expect(changes.stations).toBeUndefined()
	})

	it("does not save a size left as it was", () => {
		expect(printingChangesOf(READ, { ...SAME, text_size: { Kitchen: "Medium" } })).toBeNull()
	})

	it("reads a station that said no size as medium", () => {
		expect(printingChangesOf({ ...READ, stationTextSize: {} }, { ...SAME, text_size: { Kitchen: "Medium" } })).toBeNull()
		expect(printingChangesOf({ ...READ, stationTextSize: {} }, { ...SAME, text_size: { Kitchen: "Large" } }).text_size).toEqual({
			Kitchen: "Large",
		})
	})

	// //// Neoffice — one ticket for each family of a send (Daniel, 03.11.2026)
	it("saves the stations that print a ticket for each family, and only the ones that changed", () => {
		const read = { ...READ, stationTicketPerFamily: { Kitchen: 0, Bar: 1 } }

		const changes = printingChangesOf(read, { ...SAME, ticket_per_family: { Kitchen: 1, Bar: 1 } })

		expect(changes.ticket_per_family).toEqual({ Kitchen: 1 })
		expect(changes.stations).toBeUndefined()
	})

	it("does not save a choice left as it was, and reads a station that said nothing as off", () => {
		expect(printingChangesOf({ ...READ, stationTicketPerFamily: { Kitchen: 1 } }, { ...SAME, ticket_per_family: { Kitchen: 1 } })).toBeNull()
		expect(printingChangesOf(READ, { ...SAME, ticket_per_family: { Kitchen: 0 } })).toBeNull()
		expect(printingChangesOf(READ, { ...SAME, ticket_per_family: { Kitchen: 1 } }).ticket_per_family).toEqual({ Kitchen: 1 })
	})
})

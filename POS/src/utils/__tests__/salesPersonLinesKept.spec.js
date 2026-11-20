//// Neoffice — added file (no upstream equivalent). The lines that name their person keep it, and the choice of the whole sale only reaches the others (neoffice-maintenance#3184).
//// The payment window offered a picker for the whole sale even where every line already named its person: it took a name (« Ben 100 % ») and the invoice kept the people of the
//// lines, because the server shares the choice of the sale among the lines that have none. The spec pins which lines the choice reaches, what the window shows when it reaches none,
//// and that no team is sent as the sale's own then.
import { describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => {
	globalThis.__ = (text) => text
	return vi.fn()
})
vi.mock("@/utils/apiWrapper", () => ({ call }))

const { billableLines, everyLineKeepsItsPerson, personsOfTheLines, salesTeamOfTheSale, someLinesKeepTheirPerson, whoKeepsLabel } =
	await import("@/utils/salesPersonLines")

const cutByAna = { item_code: "CUT", rate: 60, quantity: 1, sales_person: "Ana", sales_person_name: "Ana Martin" }
const colourByBen = { item_code: "COLOUR", rate: 90, quantity: 1, sales_person: "Ben", sales_person_name: "Ben Roux" }
const cutByAnaAgain = { ...cutByAna, quantity: 2 }
const brushNobody = { item_code: "BRUSH", rate: 12, quantity: 1 }
const gift = { item_code: "SAMPLE", rate: 0, quantity: 1, is_free_item: true }
const chosen = [{ sales_person: "Ben", sales_person_name: "Ben Roux", allocated_percentage: 100 }]

describe("which lines the choice of the whole sale reaches", () => {
	it("counts the lines worth something, not a free one", () => {
		expect(billableLines([cutByAna, gift, brushNobody])).toEqual([cutByAna, brushNobody])
		expect(billableLines(undefined)).toEqual([])
	})

	it("reaches none where every billable line names its person", () => {
		expect(everyLineKeepsItsPerson([cutByAna, colourByBen])).toBe(true)
		expect(someLinesKeepTheirPerson([cutByAna, colourByBen])).toBe(false)
	})

	it("a free line without a person does not count: it earns no commission to share", () => {
		expect(everyLineKeepsItsPerson([cutByAna, gift])).toBe(true)
	})

	it("reaches the others where some lines name their person and some do not", () => {
		expect(everyLineKeepsItsPerson([cutByAna, brushNobody])).toBe(false)
		expect(someLinesKeepTheirPerson([cutByAna, brushNobody])).toBe(true)
	})

	it("reaches every line where none names its person", () => {
		expect(everyLineKeepsItsPerson([brushNobody])).toBe(false)
		expect(someLinesKeepTheirPerson([brushNobody])).toBe(false)
	})

	it("says nothing of an empty cart", () => {
		expect(everyLineKeepsItsPerson([])).toBe(false)
		expect(someLinesKeepTheirPerson([])).toBe(false)
		expect(everyLineKeepsItsPerson(undefined)).toBe(false)
	})
})

describe("the people the window shows when the lines keep theirs", () => {
	it("names each person once, in the order of the cart, by the name of the line", () => {
		expect(personsOfTheLines([cutByAna, colourByBen, cutByAnaAgain])).toEqual([
			{ sales_person: "Ana", sales_person_name: "Ana Martin" },
			{ sales_person: "Ben", sales_person_name: "Ben Roux" },
		])
	})

	it("falls back to the id of the person when the line carries no name", () => {
		expect(personsOfTheLines([{ ...cutByAna, sales_person_name: null }])).toEqual([
			{ sales_person: "Ana", sales_person_name: "Ana" },
		])
	})

	it("leaves out a line that names nobody and a free line", () => {
		expect(personsOfTheLines([brushNobody, gift, cutByAna])).toEqual([{ sales_person: "Ana", sales_person_name: "Ana Martin" }])
	})
})

describe("the team the sale sends as its own", () => {
	it("sends none where every line names its person: a choice taken and ignored is never sent", () => {
		expect(salesTeamOfTheSale({ lines: [cutByAna, colourByBen], selected: chosen })).toEqual([])
	})

	it("sends what was chosen where some line has no person: the choice reaches it", () => {
		expect(salesTeamOfTheSale({ lines: [cutByAna, brushNobody], selected: chosen })).toEqual(chosen)
	})

	it("sends what was chosen where no line names its person", () => {
		expect(salesTeamOfTheSale({ lines: [brushNobody], selected: chosen })).toEqual(chosen)
	})

	it("sends none where nothing was chosen", () => {
		expect(salesTeamOfTheSale({ lines: [brushNobody], selected: [] })).toEqual([])
		expect(salesTeamOfTheSale({ lines: [brushNobody] })).toEqual([])
	})
})

describe("what the window says of the people the lines name", () => {
	it("speaks of the work where the site tells services from products", () => {
		expect(whoKeepsLabel("service", true, true)).toBe("The services keep the person who did them.")
		expect(whoKeepsLabel("service", false, true)).toBe("The services keep the person who did them.")
	})

	it("speaks of the sale where the lines are products", () => {
		expect(whoKeepsLabel("product", true, true)).toBe("The items keep the person who sold them.")
	})

	it("speaks of the lines where the site does not tell the kinds, and says only some lines have one when only some do", () => {
		expect(whoKeepsLabel("service", true, false)).toBe("Every line keeps its sales person.")
		expect(whoKeepsLabel("service", false, false)).toBe("The lines that have a sales person keep it.")
	})
})

//// Neoffice — added file (no upstream equivalent). When the payment window asks for a sales person of the whole sale (neoffice-maintenance#3109): a till that follows sales persons asked
//// « Sales Persons * » of a sale even where nobody could be chosen (a company with no sales person yet, one whose people all rent their chair), and blocked it. The rule is the server's
//// (`validate_sales_person_coverage` asks a person only where the till offers somebody): the spec pins that the window reads it the same way, and that a list not read yet, or whose
//// read failed, never lifts the question.
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => {
	globalThis.__ = (text) => text
	return vi.fn()
})
vi.mock("@/utils/apiWrapper", () => ({ call }))

const { forgetItemKinds } = await import("@/utils/itemKinds")
const { nobodyCanBeChosen, salesPersonIsRequired } = await import("@/utils/salesPersonLines")

const cut = { item_code: "CUT", rate: 60, quantity: 1 }
const cutByLuc = { ...cut, sales_person: "Luc" }

const sale = (changes = {}) => ({
	enabled: true,
	offline: false,
	lines: [cut],
	productsTracked: false,
	listRead: true,
	offered: 2,
	...changes,
})

describe("when the payment window asks for a sales person of the whole sale", () => {
	beforeEach(() => {
		forgetItemKinds()
		call.mockReset()
	})

	it("asks for one where the till follows sales persons, a line asks for a person and somebody can be chosen", () => {
		expect(salesPersonIsRequired(sale())).toBe(true)
	})

	it("asks for nobody where the list that was read holds nobody: a field nobody can fill blocks a sale for nothing", () => {
		expect(salesPersonIsRequired(sale({ offered: 0 }))).toBe(false)
	})

	it("keeps asking while the list is not read yet, or after a read that failed: an empty list says nothing then", () => {
		expect(salesPersonIsRequired(sale({ listRead: false, offered: 0 }))).toBe(true)
	})

	it("asks for nobody where every line already has its person (the appointment's steps)", () => {
		expect(salesPersonIsRequired(sale({ lines: [cutByLuc] }))).toBe(false)
		expect(salesPersonIsRequired(sale({ lines: [cutByLuc, cut] }))).toBe(true)
	})

	it("asks for nobody where the till does not follow sales persons, or offline", () => {
		expect(salesPersonIsRequired(sale({ enabled: false }))).toBe(false)
		expect(salesPersonIsRequired(sale({ offline: true }))).toBe(false)
	})

	it("asks for nobody where no line asks for a person (a sale worth nothing)", () => {
		expect(salesPersonIsRequired(sale({ lines: [{ ...cut, rate: 0 }] }))).toBe(false)
	})
})

describe("whether nobody can be chosen", () => {
	it("is known only from a list that was read", () => {
		expect(nobodyCanBeChosen({ listRead: true, offered: 0 })).toBe(true)
		expect(nobodyCanBeChosen({ listRead: false, offered: 0 })).toBe(false)
		expect(nobodyCanBeChosen({ listRead: true, offered: 1 })).toBe(false)
		expect(nobodyCanBeChosen()).toBe(false)
	})
})

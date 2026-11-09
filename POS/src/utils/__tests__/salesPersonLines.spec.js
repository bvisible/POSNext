//// Neoffice — added file (no upstream equivalent). Which lines of a cart ask for a sales person, and in which words (NeoSalon, lot G1, product owner, 09.11.2026).
// The rule is the server's; the spec pins that the till reads it the same way: a service always asks, a product only when products are tracked,
// a free line and a line worth nothing never, a site that does not tell the kinds keeps every line a service and the ordinary words.
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => {
	globalThis.__ = (text) => text
	return vi.fn()
})
vi.mock("@/utils/apiWrapper", () => ({ call }))

const { forgetItemKinds, loadItemKinds } = await import("@/utils/itemKinds")
const {
	everyLineHasItsPerson,
	kindOfLines,
	lineAsksForAPerson,
	lineIsWorthNothing,
	linesWithoutTheirPerson,
	sameLinePerson,
	whoLabel,
} = await import("@/utils/salesPersonLines")

const cut = { item_code: "CUT", rate: 60, quantity: 1 }
const shampoo = { item_code: "SHAMPOO", rate: 30, quantity: 1 }

async function theSiteSays(kinds, told = true) {
	call.mockResolvedValueOnce({ message: { told, kinds } })
	await loadItemKinds("Till", Object.keys(kinds))
}

describe("the lines that ask for a sales person", () => {
	beforeEach(() => {
		forgetItemKinds()
		call.mockReset()
	})

	it("asks a service for its person whatever the tick of the products", async () => {
		await theSiteSays({ CUT: "service", SHAMPOO: "product" })
		expect(lineAsksForAPerson(cut, { productsTracked: false })).toBe(true)
		expect(lineAsksForAPerson(cut, { productsTracked: true })).toBe(true)
	})

	it("asks a product only when the products are tracked", async () => {
		await theSiteSays({ CUT: "service", SHAMPOO: "product" })
		expect(lineAsksForAPerson(shampoo, { productsTracked: false })).toBe(false)
		expect(lineAsksForAPerson(shampoo, { productsTracked: true })).toBe(true)
	})

	it("counts a line the site does not name as a service, so that nothing changes without the hook", async () => {
		await theSiteSays({ SHAMPOO: "" }, false)
		expect(lineAsksForAPerson(shampoo, { productsTracked: false })).toBe(true)
		expect(
			lineAsksForAPerson({ item_code: "NEVER_ASKED", rate: 5, quantity: 1 }),
		).toBe(true)
	})

	it("asks nothing of a free line or a line worth nothing, as the server does", () => {
		expect(lineIsWorthNothing({ ...cut, is_free_item: 1 })).toBe(true)
		expect(lineIsWorthNothing({ ...cut, rate: 0 })).toBe(true)
		expect(lineIsWorthNothing({ ...cut, discount_percentage: 100 })).toBe(true)
		expect(lineIsWorthNothing({ ...cut, quantity: 0 })).toBe(true)
		expect(lineIsWorthNothing(cut)).toBe(false)
		expect(
			lineAsksForAPerson({ ...cut, rate: 0 }, { productsTracked: true }),
		).toBe(false)
	})

	it("lists the lines that ask and have no person yet", async () => {
		await theSiteSays({ CUT: "service", SHAMPOO: "product" })
		const lines = [
			cut,
			{ ...cut, item_code: "COLOUR", sales_person: "Sonia" },
			shampoo,
		]
		expect(linesWithoutTheirPerson(lines, { productsTracked: false })).toEqual([
			cut,
		])
		expect(linesWithoutTheirPerson(lines, { productsTracked: true })).toEqual([
			cut,
			shampoo,
		])
	})

	it("is satisfied when nothing asks (a product alone, products not tracked)", async () => {
		await theSiteSays({ SHAMPOO: "product" })
		expect(everyLineHasItsPerson([shampoo], { productsTracked: false })).toBe(
			true,
		)
		expect(everyLineHasItsPerson([shampoo], { productsTracked: true })).toBe(
			false,
		)
	})

	it("merges only the lines that name the same person", () => {
		expect(
			sameLinePerson({ sales_person: "Luc" }, { sales_person: "Luc" }),
		).toBe(true)
		expect(
			sameLinePerson({ sales_person: "Luc" }, { sales_person: "Sonia" }),
		).toBe(false)
		expect(sameLinePerson({}, { sales_person: null })).toBe(true)
		expect(sameLinePerson({ sales_person: "Luc" }, {})).toBe(false)
	})
})

describe("the words of the question", () => {
	beforeEach(() => {
		forgetItemKinds()
		call.mockReset()
	})

	it("keeps the ordinary words on a site that does not tell the kinds (a shop, a restaurant)", () => {
		expect(whoLabel("service")).toBe("Sales Person")
		expect(whoLabel("product")).toBe("Sales Person")
	})

	it("says who did the work of a service and who sold a product where the site tells the kinds", async () => {
		await theSiteSays({ CUT: "service", SHAMPOO: "product" })
		expect(whoLabel("service")).toBe("Who did the work?")
		expect(whoLabel("product")).toBe("Who sold it?")
	})

	it("words a cart of products alone as a sale, and any cart with a service as the work", async () => {
		await theSiteSays({ CUT: "service", SHAMPOO: "product" })
		expect(kindOfLines([shampoo])).toBe("product")
		expect(kindOfLines([cut, shampoo])).toBe("service")
		expect(kindOfLines([])).toBe("service")
	})
})

describe("the kinds asked of the server", () => {
	beforeEach(() => {
		forgetItemKinds()
		call.mockReset()
	})

	it("asks once per item and never twice", async () => {
		call.mockResolvedValue({
			message: { told: true, kinds: { CUT: "service" } },
		})
		await loadItemKinds("Till", ["CUT"])
		await loadItemKinds("Till", ["CUT"])
		expect(call).toHaveBeenCalledTimes(1)
		expect(call.mock.calls[0][1]).toEqual({
			pos_profile: "Till",
			item_codes: ["CUT"],
		})
	})

	it("forgets a failed ask so that the next one tries again", async () => {
		const quiet = vi.spyOn(console, "error").mockImplementation(() => {})
		call.mockRejectedValueOnce(new Error("offline"))
		await loadItemKinds("Till", ["CUT"])
		call.mockResolvedValueOnce({
			message: { told: true, kinds: { CUT: "service" } },
		})
		await loadItemKinds("Till", ["CUT"])
		expect(call).toHaveBeenCalledTimes(2)
		quiet.mockRestore()
	})
})

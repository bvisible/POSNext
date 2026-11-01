/**
 * //// Neoffice — added file (no upstream equivalent). The cart of a table's order, grouped by course like the kitchen's ticket (NeoRestau lot 1, Daniel, 01.11: « il faut
 * //// la même logique que dans la cuisine sur le ticket de la table, il faut barrer et réduire pour laisser que ce qu'il reste visible »). The rule is pure: the cart's
 * //// rows in, the groups to draw out, in the order of the meal, with the courses that are all delivered folded and the lines held back in a last group of their own.
 */
import { describe, expect, it, vi } from "vitest"

import {
	courseGroupLabel,
	groupCartByCourse,
	isDeliveredLine,
	toggleKey,
} from "../cartCourses"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
})

const line = (name, family, status, more = {}) => ({
	item_code: name,
	item_name: name,
	service_family: family,
	kds_status: status,
	rate: 10,
	quantity: 1,
	...more,
})

const keys = (groups) => groups.map((group) => group.key)
const names = (rows) => rows.map((row) => row.item_name)

describe("the cart grouped by course", () => {
	it("puts the courses in the order of the meal, whatever the order the lines were added in", () => {
		const groups = groupCartByCourse([
			line("TART", "Dessert", "Pending"),
			line("PENNE", "Main", "Pending"),
			line("RED", "Drink", "Pending"),
			line("SOUP", "Starter", "Pending"),
		])

		expect(keys(groups)).toEqual(["Drink", "Starter", "Main", "Dessert"])
	})

	it("keeps the lines of a course in the order they came in", () => {
		const [starters] = groupCartByCourse([
			line("SOUP", "Starter", "Pending"),
			line("SALAD", "Starter", "Pending"),
			line("TERRINE", "Starter", "Pending"),
		])

		expect(names(starters.rows)).toEqual(["SOUP", "SALAD", "TERRINE"])
	})

	it("draws only the courses that have a line", () => {
		const groups = groupCartByCourse([
			line("PENNE", "Main", "Pending"),
			line("TART", "Dessert", "Pending"),
		])

		expect(keys(groups)).toEqual(["Main", "Dessert"])
	})

	it("leaves a line with no family after the courses, in a group that has no header", () => {
		const groups = groupCartByCourse([
			line("GIFT CARD", "", "Pending"),
			line("TART", "Dessert", "Pending"),
			line("BREAD", undefined, "Pending"),
			line("SOUP", "Starter", "Pending"),
		])

		expect(keys(groups)).toEqual(["Starter", "Dessert", "loose"])
		expect(groups.at(-1).kind).toBe("loose")
		expect(names(groups.at(-1).rows)).toEqual(["GIFT CARD", "BREAD"])
	})

	it("treats a family nobody knows as no family", () => {
		const groups = groupCartByCourse([line("ODD", "Cheese", "Pending")])

		expect(keys(groups)).toEqual(["loose"])
	})

	it("returns nothing for an empty cart", () => {
		expect(groupCartByCourse([])).toEqual([])
		expect(groupCartByCourse(undefined)).toEqual([])
	})

	it("hands back the very rows it was given: the cart acts on them", () => {
		const soup = line("SOUP", "Starter", "Pending")

		const [starters] = groupCartByCourse([soup])

		expect(starters.rows[0]).toBe(soup)
	})
})

describe("the lines held back", () => {
	it("go in a group of their own, the last one, whatever their course", () => {
		const groups = groupCartByCourse([
			line("PENNE", "Main", "Waiting"),
			line("SOUP", "Starter", "Pending"),
			line("TART", "Dessert", "Waiting"),
			line("BREAD", "", "Pending"),
		])

		expect(keys(groups)).toEqual(["Starter", "loose", "held"])
		expect(groups.at(-1).kind).toBe("held")
		expect(names(groups.at(-1).rows)).toEqual(["PENNE", "TART"])
	})

	it("come in the order of the meal inside their group: the next course to order first", () => {
		const held = groupCartByCourse([
			line("TART", "Dessert", "Waiting"),
			line("ODD", "", "Waiting"),
			line("PENNE", "Main", "Waiting"),
			line("RED", "Drink", "Waiting"),
		]).at(-1)

		expect(names(held.rows)).toEqual(["RED", "PENNE", "TART", "ODD"])
	})

	it("never fold, and never make their course fold or stay open", () => {
		const groups = groupCartByCourse([
			line("PENNE", "Main", "Delivered"),
			line("RIGATONI", "Main", "Waiting"),
		])

		expect(keys(groups)).toEqual(["Main", "held"])
		expect(groups[0].folded).toBe(true)
		expect(groups[1].folded).toBe(false)
		expect(groups[1].visibleRows).toHaveLength(1)
	})
})

describe("a course that is all delivered", () => {
	it("folds: its lines are not drawn", () => {
		const [starters] = groupCartByCourse([
			line("SOUP", "Starter", "Delivered"),
			line("SALAD", "Starter", "Delivered"),
		])

		expect(starters.delivered).toBe(true)
		expect(starters.folded).toBe(true)
		expect(starters.visibleRows).toEqual([])
	})

	it("says how many lines it folds and what they come to", () => {
		const [starters] = groupCartByCourse([
			line("SOUP", "Starter", "Delivered", { rate: 12, quantity: 2 }),
			line("SALAD", "Starter", "Delivered", { rate: 9.5, quantity: 1 }),
		])

		expect(starters.count).toBe(2)
		expect(starters.subtotal).toBeCloseTo(33.5, 5)
	})

	it("is summed on the amount of the line when it has one, a discount included", () => {
		const [starters] = groupCartByCourse([
			line("SOUP", "Starter", "Delivered", { rate: 12, quantity: 2, amount: 20 }),
			line("SALAD", "Starter", "Delivered", { rate: 9.5, amount: 0 }),
		])

		expect(starters.subtotal).toBeCloseTo(20, 5)
	})

	it("can be summed the cart's way", () => {
		const [starters] = groupCartByCourse(
			[line("SOUP", "Starter", "Delivered")],
			{ amountOf: () => 7 },
		)

		expect(starters.subtotal).toBe(7)
	})

	it("opens when its key is among the ones a waiter opened, and shows every line", () => {
		const [starters] = groupCartByCourse(
			[
				line("SOUP", "Starter", "Delivered"),
				line("SALAD", "Starter", "Delivered"),
			],
			{ expanded: new Set(["Starter"]) },
		)

		expect(starters.delivered).toBe(true)
		expect(starters.folded).toBe(false)
		expect(names(starters.visibleRows)).toEqual(["SOUP", "SALAD"])
	})

	it("opens one course without opening the others", () => {
		const groups = groupCartByCourse(
			[
				line("SOUP", "Starter", "Delivered"),
				line("PENNE", "Main", "Delivered"),
			],
			{ expanded: new Set(["Main"]) },
		)

		expect(groups.map((group) => group.folded)).toEqual([true, false])
	})
})

describe("a course that still has something to do", () => {
	it.each([
		["a line the kitchen is cooking", "Preparing"],
		["a line waiting at the pass", "Ready"],
		["a line the kitchen has just got", "Pending"],
		["a line not sent yet", ""],
		["a line with no status at all", undefined],
	])("does not fold with %s", (_, status) => {
		const [mains] = groupCartByCourse([
			line("PENNE", "Main", "Delivered"),
			line("RISOTTO", "Main", status),
		])

		expect(mains.delivered).toBe(false)
		expect(mains.folded).toBe(false)
		expect(names(mains.visibleRows)).toEqual(["PENNE", "RISOTTO"])
	})

	it("keeps its delivered lines among the others, in their place", () => {
		const [mains] = groupCartByCourse([
			line("RISOTTO", "Main", "Pending"),
			line("PENNE", "Main", "Delivered"),
		])

		expect(names(mains.rows)).toEqual(["RISOTTO", "PENNE"])
	})
})

describe("what is not a course", () => {
	it("never folds, even when every line of it is delivered: it has no header to open", () => {
		const groups = groupCartByCourse([line("BREAD", "", "Delivered")])

		expect(groups[0].kind).toBe("loose")
		expect(groups[0].folded).toBe(false)
		expect(names(groups[0].visibleRows)).toEqual(["BREAD"])
	})
})

describe("the rows that hang under a line", () => {
	const offered = (name, parent, status, more = {}) =>
		line(name, parent.service_family, status, {
			_offeredOf: `${parent.item_code}-`,
			rate: 0,
			amount: 0,
			...more,
		})

	it("an offered row or a gift follows its line into the same group", () => {
		const penne = line("PENNE", "Main", "Pending")
		const soup = line("SOUP", "Starter", "Pending")
		const groups = groupCartByCourse([
			penne,
			offered("PENNE offered", penne, "Pending"),
			soup,
			{ ...line("SOUP gift", "", ""), _giftOf: "SOUP-", _isStandaloneFreeRow: true },
		])

		expect(keys(groups)).toEqual(["Starter", "Main"])
		expect(names(groups[0].rows)).toEqual(["SOUP", "SOUP gift"])
		expect(names(groups[1].rows)).toEqual(["PENNE", "PENNE offered"])
	})

	it("is no line of its own: it is not counted, but what it costs is", () => {
		const penne = line("PENNE", "Main", "Delivered", { rate: 10, quantity: 2 })
		const [mains] = groupCartByCourse([
			penne,
			offered("PENNE offered", penne, "Delivered", { amount: 4 }),
		])

		expect(mains.count).toBe(1)
		expect(mains.subtotal).toBeCloseTo(24, 5)
	})

	it("follows its line into the held group", () => {
		const tart = line("TART", "Dessert", "Waiting")
		const groups = groupCartByCourse([tart, offered("TART offered", tart, "Waiting")])

		expect(keys(groups)).toEqual(["held"])
		expect(names(groups[0].rows)).toEqual(["TART", "TART offered"])
	})

	it("does not decide whether its course is all delivered: its line does", () => {
		const penne = line("PENNE", "Main", "Delivered")
		const [mains] = groupCartByCourse([
			penne,
			offered("PENNE offered", penne, undefined),
		])

		expect(mains.delivered).toBe(true)
		expect(mains.folded).toBe(true)
	})

	it("stands on its own, in no course, when no line comes before it", () => {
		const groups = groupCartByCourse([
			{ ...line("ORPHAN", "", ""), _giftOf: "NOBODY-" },
		])

		expect(keys(groups)).toEqual(["loose"])
	})
})

describe("the bill", () => {
	it("is the same grouped or not: a delivered line is still billed", () => {
		const rows = [
			line("SOUP", "Starter", "Delivered", { rate: 12 }),
			line("PENNE", "Main", "Delivered", { rate: 24, quantity: 2 }),
			line("TART", "Dessert", "Waiting", { rate: 9 }),
			line("BREAD", "", "Pending", { rate: 3 }),
		]

		const groups = groupCartByCourse(rows)

		const grouped = groups.reduce((sum, group) => sum + group.subtotal, 0)
		expect(grouped).toBeCloseTo(12 + 48 + 9 + 3, 5)
		expect(groups.flatMap((group) => group.rows)).toHaveLength(rows.length)
	})
})

describe("opening and closing a fold", () => {
	it("adds the key of a course that was folded", () => {
		const opened = toggleKey(new Set(), "Starter")

		expect(opened.has("Starter")).toBe(true)
	})

	it("takes it away again when it was open", () => {
		const closed = toggleKey(new Set(["Starter", "Main"]), "Starter")

		expect([...closed]).toEqual(["Main"])
	})

	it("hands back a new set and leaves the one it was given alone", () => {
		const before = new Set(["Main"])

		const after = toggleKey(before, "Starter")

		expect(after).not.toBe(before)
		expect([...before]).toEqual(["Main"])
	})
})

describe("the words on a header", () => {
	it("names a course in the language of the restaurant", () => {
		const [starters, mains] = groupCartByCourse([
			line("SOUP", "Starter", "Pending"),
			line("PENNE", "Main", "Pending"),
		])

		expect(courseGroupLabel(starters)).toBe("Starters")
		expect(courseGroupLabel(mains)).toBe("Mains")
	})

	it("calls the held group as the kitchen does", () => {
		const held = groupCartByCourse([line("PENNE", "Main", "Waiting")])[0]

		expect(courseGroupLabel(held)).toBe("Coming Next")
	})

	it("has none for the lines that are no course", () => {
		const loose = groupCartByCourse([line("BREAD", "", "Pending")])[0]

		expect(courseGroupLabel(loose)).toBe("")
	})
})

describe("a delivered line", () => {
	it("is one the kitchen has delivered", () => {
		expect(isDeliveredLine(line("SOUP", "Starter", "Delivered"))).toBe(true)
		expect(isDeliveredLine(line("SOUP", "Starter", "Ready"))).toBe(false)
		expect(isDeliveredLine(line("SOUP", "Starter", ""))).toBe(false)
		expect(isDeliveredLine(null)).toBe(false)
	})
})

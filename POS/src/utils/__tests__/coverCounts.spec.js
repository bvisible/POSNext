/**
 * //// Neoffice — added file (no upstream equivalent). The covers of a table and the count of portions per course against them (NeoResto lot 1, covers): the number of people is a whole number from 1 to 99 or nothing at all,
 * //// the counter of the order's header has one chip per course that has a line (Starter, Main, Dessert, in the order of the meal) with its state against the people seated, a drink and a dish with no course never count,
 * //// a row that hangs under another (a promotion's gift, a free row) is no portion of its own, and the kitchen's ticket reads the count the SERVER made over the whole order.
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	// The app's `__`: indexed placeholders; the context is not looked at here
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

const {
	COVERS_MAX,
	COVERS_MIN,
	TALLY_TEXT,
	clampCovers,
	courseChips,
	coversPayload,
	normalizeCovers,
	portionsByCourse,
	tallyState,
	tallyText,
	ticketCoversLabel,
	ticketTally,
} = await import("../coverCounts")

const line = (family, quantity = 1, extra = {}) => ({
	item_code: `ITEM-${family}-${quantity}`,
	service_family: family,
	quantity,
	...extra,
})

describe("the number of people", () => {
	it("is a whole number from 1 to 99", () => {
		expect([COVERS_MIN, COVERS_MAX]).toEqual([1, 99])
		expect(normalizeCovers(1)).toBe(1)
		expect(normalizeCovers(4)).toBe(4)
		expect(normalizeCovers(99)).toBe(99)
	})

	it("takes a number written as text, with its spaces", () => {
		expect(normalizeCovers("3")).toBe(3)
		expect(normalizeCovers(" 12 ")).toBe(12)
	})

	it.each([
		[null],
		[undefined],
		[""],
		[0],
		[-1],
		[100],
		[3.5],
		["3.5"],
		["abc"],
		[Number.NaN],
		[Number.POSITIVE_INFINITY],
		[true],
		[{}],
		[[]],
	])("is nothing at all for %o", (value) => {
		expect(normalizeCovers(value)).toBeNull()
	})

	it("is brought into bounds by the stepper's helper, and falls back for something that is no number", () => {
		expect(clampCovers(0)).toBe(1)
		expect(clampCovers(-5)).toBe(1)
		expect(clampCovers(150)).toBe(99)
		expect(clampCovers("7")).toBe(7)
		expect(clampCovers(3.6)).toBe(4)
		expect(clampCovers("")).toBe(1)
		expect(clampCovers("abc", 2)).toBe(2)
		expect(clampCovers(null, 4)).toBe(4)
	})
})

describe("what an order payload carries for the covers", () => {
	it("is the key and the number when one is set", () => {
		expect(coversPayload(3)).toEqual({ restaurant_covers: 3 })
		expect(coversPayload("5")).toEqual({ restaurant_covers: 5 })
	})

	it("is nothing at all when none is set, never an invalid value", () => {
		for (const value of [null, undefined, "", 0, 100, -2, 2.5, "x"])
			expect(coversPayload(value)).toEqual({})
	})
})

describe("the state of a course against the people seated", () => {
	it("is none while nobody is counted", () => {
		expect(tallyState(2, null)).toBe("none")
		expect(tallyState(2, undefined)).toBe("none")
	})

	it("is short below the people, done at exactly the people, over above them", () => {
		expect(tallyState(2, 3)).toBe("short")
		expect(tallyState(0, 3)).toBe("short")
		expect(tallyState(3, 3)).toBe("done")
		expect(tallyState(4, 3)).toBe("over")
	})
})

describe("the portions per course", () => {
	it("add the quantities of the lines of a course", () => {
		const portions = portionsByCourse([
			line("Starter", 2),
			line("Starter", 1),
			line("Main", 3),
		])

		expect([...portions]).toEqual([
			["Starter", 3],
			["Main", 3],
		])
	})

	it("leave a drink out: it follows no course", () => {
		expect([...portionsByCourse([line("Drink", 6), line("Main", 1)])]).toEqual([
			["Main", 1],
		])
	})

	it("leave out a line with no family, or one nobody knows", () => {
		const portions = portionsByCourse([
			line("", 2),
			line(undefined, 2),
			line("Cheese", 2),
			line("Dessert", 1),
		])

		expect([...portions]).toEqual([["Dessert", 1]])
	})

	it("leave out the rows that hang under another line, and the free ones", () => {
		const portions = portionsByCourse([
			line("Main", 2),
			line("Main", 1, { _giftOf: "ITEM-Main-2-" }),
			line("Main", 1, { _offeredOf: "ITEM-Main-2-" }),
			line("Main", 1, { is_free_item: 1 }),
			line("Main", 1, { _isStandaloneFreeRow: true }),
		])

		expect([...portions]).toEqual([["Main", 2]])
	})

	it("count an offered row: it is a real portion on the table, as the kitchen's ticket counts it", () => {
		expect([
			...portionsByCourse([
				line("Main", 2),
				line("Main", 1, { posa_is_offered: 1, is_free_item: 0 }),
			]),
		]).toEqual([["Main", 3]])
	})

	it("ignore an empty line, and read a quantity written `qty` as the server writes it", () => {
		expect([
			...portionsByCourse([
				line("Starter", 0),
				{ service_family: "Starter", qty: 2 },
			]),
		]).toEqual([["Starter", 2]])
	})

	it("sum weighed quantities without the float noise", () => {
		const chips = courseChips([line("Main", 0.1), line("Main", 0.2)], 1)

		expect(chips[0].count).toBe(0.3)
	})

	it("are nothing for no lines", () => {
		expect(portionsByCourse([]).size).toBe(0)
		expect(portionsByCourse(null).size).toBe(0)
		expect(portionsByCourse(undefined).size).toBe(0)
	})
})

describe("the chips of the counter", () => {
	const meal = [
		line("Main", 2),
		line("Dessert", 3),
		line("Starter", 3),
		line("Drink", 5),
	]

	it("come in the order of the meal, one per course that has a line, with the words of the ticket's labels", () => {
		const chips = courseChips(meal, 3)

		expect(
			chips.map((chip) => [chip.family, chip.label, chip.count, chip.covers]),
		).toEqual([
			["Starter", "Starters", 3, 3],
			["Main", "Mains", 2, 3],
			["Dessert", "Desserts", 3, 3],
		])
	})

	it("say done at the people, short below them", () => {
		const chips = courseChips(meal, 3)

		expect(chips.map((chip) => chip.state)).toEqual(["done", "short", "done"])
	})

	it("say over when there are more portions than people", () => {
		expect(courseChips([line("Main", 4)], 3)[0]).toMatchObject({
			count: 4,
			covers: 3,
			state: "over",
		})
	})

	it("say none, with the count alone, while the covers are not set", () => {
		const chips = courseChips(meal, null)

		expect(
			chips.map((chip) => [chip.family, chip.count, chip.covers, chip.state]),
		).toEqual([
			["Starter", 3, null, "none"],
			["Main", 2, null, "none"],
			["Dessert", 3, null, "none"],
		])
	})

	it("take an invalid number of people as none", () => {
		expect(
			courseChips(meal, 0).every(
				(chip) => chip.state === "none" && chip.covers === null,
			),
		).toBe(true)
		expect(courseChips(meal, 120).every((chip) => chip.state === "none")).toBe(
			true,
		)
	})

	it("show a course only when it has a line", () => {
		expect(
			courseChips([line("Starter", 1)], 2).map((chip) => chip.family),
		).toEqual(["Starter"])
		expect(courseChips([line("Drink", 2)], 2)).toEqual([])
		expect(courseChips([], 2)).toEqual([])
	})
})

describe("the count on a kitchen or pass ticket", () => {
	const order = {
		covers: 3,
		family_counts: { Starter: 3, Main: 2, Dessert: 4, Drink: 6 },
	}

	it("is the server's count of the course against the order's covers", () => {
		expect(ticketTally(order, "Main")).toEqual({
			count: 2,
			covers: 3,
			state: "short",
		})
		expect(ticketTally(order, "Starter")).toEqual({
			count: 3,
			covers: 3,
			state: "done",
		})
		expect(ticketTally(order, "Dessert")).toEqual({
			count: 4,
			covers: 3,
			state: "over",
		})
	})

	it("is nothing for a drink", () => {
		expect(ticketTally(order, "Drink")).toBeNull()
	})

	it("is nothing while the order has no covers", () => {
		expect(ticketTally({ ...order, covers: null }, "Main")).toBeNull()
		expect(ticketTally({ ...order, covers: 0 }, "Main")).toBeNull()
		expect(
			ticketTally({ family_counts: order.family_counts }, "Main"),
		).toBeNull()
	})

	it("is nothing for a course the server did not count, rather than a wrong 0", () => {
		expect(
			ticketTally({ covers: 3, family_counts: { Starter: 3 } }, "Main"),
		).toBeNull()
		expect(ticketTally({ covers: 3 }, "Main")).toBeNull()
		expect(ticketTally({ covers: 3, family_counts: null }, "Main")).toBeNull()
		expect(ticketTally(null, "Main")).toBeNull()
	})

	it("reads the count the server may send as text", () => {
		expect(
			ticketTally({ covers: 3, family_counts: { Main: "2" } }, "Main"),
		).toEqual({ count: 2, covers: 3, state: "short" })
	})

	it("writes the count as « 2/3 »", () => {
		expect(tallyText({ count: 2, covers: 3 })).toBe("2/3")
	})

	it("has a text colour for each state, the status tones of the design system", () => {
		expect(Object.keys(TALLY_TEXT).sort()).toEqual([
			"done",
			"none",
			"over",
			"short",
		])
		expect(TALLY_TEXT.short).toContain("#92610C")
		expect(TALLY_TEXT.done).toContain("#11663A")
		expect(TALLY_TEXT.over).toContain("#9C2920")
	})
})

describe("what a ticket says of the people at its table", () => {
	it("is « 3 guests », and « 1 guest » for one", () => {
		expect(ticketCoversLabel(3)).toBe("3 guests")
		expect(ticketCoversLabel(1)).toBe("1 guest")
	})

	it("is nothing for no number", () => {
		for (const value of [null, undefined, 0, "", 100])
			expect(ticketCoversLabel(value)).toBe("")
	})
})

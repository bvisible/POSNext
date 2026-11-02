/**
 * //// Neoffice — added file (no upstream equivalent). The order of the meal on a kitchen ticket (NeoResto lot 1, Daniel, 01.11: « on commence évidemment par les entrées. On ne peut pas
 * //// lancer les plats si on n'a pas fait les entrées. Les plats viennent disponibles quand on a fini les entrées »). A course waits, greyed, while a course before it still has a dish to
 * //// cook; the drinks, and a dish with no family, never wait and never make another wait. Read without a screen.
 */
import { describe, expect, it } from "vitest"
import {
	DEFAULT_COURSE_ORDER,
	courseOrderFromStorage,
	followsTheOrderOfTheMeal,
	isHeldByCourse,
	lockedCourseRank,
} from "../courseOrder"

const line = (family, status, extra = {}) => ({
	item_code: `${family}-${status}`,
	service_family: family,
	kds_status: status,
	...extra,
})

describe("a course that waits for the one before it", () => {
	it("holds the mains while a starter is still to start", () => {
		const lines = [line("Starter", "Pending"), line("Main", "Pending")]

		expect(isHeldByCourse(lines[0], lines)).toBe(false)
		expect(isHeldByCourse(lines[1], lines)).toBe(true)
	})

	it("holds the mains while a starter is being prepared", () => {
		const lines = [line("Starter", "Preparing"), line("Main", "Pending")]

		expect(isHeldByCourse(lines[1], lines)).toBe(true)
	})

	it("lets the mains go once the starters are ready, or delivered, or at the pass", () => {
		for (const done of ["Ready", "Delivered"]) {
			const lines = [line("Starter", done), line("Main", "Pending")]
			expect(isHeldByCourse(lines[1], lines), done).toBe(false)
		}
		const atThePass = [
			line("Starter", "Delivered", { at_the_pass: true }),
			line("Main", "Pending"),
		]
		expect(isHeldByCourse(atThePass[1], atThePass)).toBe(false)
	})

	it("holds the desserts while the mains are not done, even when the starters are", () => {
		const lines = [
			line("Starter", "Delivered"),
			line("Main", "Preparing"),
			line("Dessert", "Pending"),
		]

		expect(isHeldByCourse(lines[2], lines)).toBe(true)
		expect(isHeldByCourse(lines[1], lines)).toBe(false)
	})

	it("lets a course go as soon as ONE course before it is the first one open: the starters being the only open ones hold both", () => {
		const lines = [
			line("Starter", "Pending"),
			line("Main", "Pending"),
			line("Dessert", "Pending"),
		]

		expect(lines.map((l) => isHeldByCourse(l, lines))).toEqual([false, true, true])
	})

	it("waits for every dish of a course, not for the first one", () => {
		const lines = [
			line("Starter", "Ready", { item_code: "A" }),
			line("Starter", "Preparing", { item_code: "B" }),
			line("Main", "Pending"),
		]

		expect(isHeldByCourse(lines[2], lines)).toBe(true)
	})

	it("never holds a drink, and a drink never holds anything", () => {
		const lines = [
			line("Drink", "Pending"),
			line("Starter", "Pending"),
			line("Main", "Pending"),
		]

		expect(isHeldByCourse(lines[0], lines)).toBe(false)
		expect(isHeldByCourse(lines[1], lines)).toBe(false)
	})

	it("ignores a dish with no family, as a dish with no family waits for nothing", () => {
		const lines = [line("", "Pending"), line("Main", "Pending")]

		expect(isHeldByCourse(lines[0], lines)).toBe(false)
		expect(isHeldByCourse(lines[1], lines)).toBe(false)
	})

	it("does not count a dish held back by the waiter (Waiting): it is not at the kitchen", () => {
		const lines = [line("Starter", "Waiting"), line("Main", "Pending")]

		expect(isHeldByCourse(lines[1], lines)).toBe(false)
	})

	it("holds nothing when the rule is off", () => {
		const lines = [line("Starter", "Pending"), line("Main", "Pending")]

		expect(isHeldByCourse(lines[1], lines, false)).toBe(false)
	})

	it("says which rank is the first still open: none, 1 for starters, 2 for mains", () => {
		expect(lockedCourseRank([line("Starter", "Ready")])).toBe(Number.POSITIVE_INFINITY)
		expect(lockedCourseRank([line("Starter", "Pending"), line("Main", "Pending")])).toBe(1)
		expect(lockedCourseRank([line("Starter", "Delivered"), line("Main", "Preparing")])).toBe(2)
	})
})

describe("the choice a device keeps", () => {
	it("is ON by default: the order of the meal is followed unless a device says otherwise", () => {
		expect(DEFAULT_COURSE_ORDER).toBe(true)
		expect(courseOrderFromStorage(null)).toBe(true)
		expect(courseOrderFromStorage(undefined)).toBe(true)
		expect(courseOrderFromStorage("garbage")).toBe(true)
	})

	it("reads what the device stored", () => {
		expect(courseOrderFromStorage("1")).toBe(true)
		expect(courseOrderFromStorage("0")).toBe(false)
	})
})

//// Neoffice — where the kitchen prepares ahead the rule is off (NeoResto lot 1, the service rhythm, Daniel, 01.11)
describe("the order of the meal where the kitchen prepares ahead", () => {
	it("is followed on a device that chose it, in the room's rhythm", () => {
		expect(followsTheOrderOfTheMeal(true, "Called by the room")).toBe(true)
		expect(followsTheOrderOfTheMeal(true, undefined)).toBe(true)
		expect(followsTheOrderOfTheMeal(true)).toBe(true)
	})

	it("is never followed where the restaurant prepares ahead, whatever the device chose", () => {
		expect(followsTheOrderOfTheMeal(true, "Prepared ahead")).toBe(false)
		expect(followsTheOrderOfTheMeal(false, "Prepared ahead")).toBe(false)
	})

	it("is not followed on a device that turned it off", () => {
		expect(followsTheOrderOfTheMeal(false, "Called by the room")).toBe(false)
		expect(followsTheOrderOfTheMeal(undefined, undefined)).toBe(false)
	})

	it("holds nothing back when the card is told it is off, whatever the lines", () => {
		const lines = [
			{ service_family: "Starter", kds_status: "Pending" },
			{ service_family: "Main", kds_status: "Pending" },
		]

		expect(isHeldByCourse(lines[1], lines, followsTheOrderOfTheMeal(true, "Called by the room"))).toBe(true)
		expect(isHeldByCourse(lines[1], lines, followsTheOrderOfTheMeal(true, "Prepared ahead"))).toBe(false)
	})
})

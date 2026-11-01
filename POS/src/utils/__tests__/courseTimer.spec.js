/**
 * //// Neoffice — added file (no upstream equivalent). The timer of a kitchen ticket counts from the course the kitchen is working on (NeoRestau lot 1, Daniel, 01.11: « il faudrait afficher le temps
 * //// maintenant du départ du dessert »): the oldest send among the dishes still to cook, else the latest send, else the order's last change. Read without a screen.
 */
import { describe, expect, it } from "vitest"
import { courseSentAt, timerStart } from "../courseTimer"

const at = (text) => new Date(text).getTime()
const line = (status, sentAt) => ({ item_code: `${status}-${sentAt}`, kds_status: status, kds_sent_at: sentAt })

const STARTERS = "2026-11-01 12:00:00.000000"
const MAINS = "2026-11-01 12:40:00.000000"
const DESSERTS = "2026-11-01 15:00:00.000000"

describe("the course the kitchen is working on", () => {
	it("is the send of the dishes still to cook, not the start of the meal", () => {
		const lines = [line("Delivered", STARTERS), line("Delivered", MAINS), line("Pending", DESSERTS)]

		expect(courseSentAt(lines)).toBe(at(DESSERTS))
	})

	it("is the OLDEST send among the dishes still to cook when two courses are open", () => {
		const lines = [line("Preparing", MAINS), line("Pending", DESSERTS)]

		expect(courseSentAt(lines)).toBe(at(MAINS))
	})

	it("counts a dish being prepared as still to cook", () => {
		expect(courseSentAt([line("Delivered", STARTERS), line("Preparing", MAINS)])).toBe(at(MAINS))
	})

	it("is the latest send when nothing is left to cook: the dishes wait at the pass since then", () => {
		const lines = [line("Delivered", STARTERS), line("Ready", MAINS)]

		expect(courseSentAt(lines)).toBe(at(MAINS))
	})

	it("ignores a dish held back by the waiter: it has not left", () => {
		const lines = [line("Pending", STARTERS), line("Waiting", DESSERTS)]

		expect(courseSentAt(lines)).toBe(at(STARTERS))
	})

	it("ignores a dish with no time, and says nothing when no dish has one", () => {
		expect(courseSentAt([line("Pending", null), line("Pending", MAINS)])).toBe(at(MAINS))
		expect(courseSentAt([line("Pending", null), line("Delivered", "")])).toBeNaN()
		expect(courseSentAt([])).toBeNaN()
		expect(courseSentAt(undefined)).toBeNaN()
	})

	it("ignores a time that is not a date", () => {
		expect(courseSentAt([line("Pending", "not a date")])).toBeNaN()
	})
})

describe("where the ticket's timer starts", () => {
	const order = (items, extra = {}) => ({
		creation: "2026-11-01 11:55:00",
		modified: "2026-11-01 15:02:00",
		items,
		...extra,
	})

	it("starts at the send of the course at the kitchen", () => {
		const started = timerStart(order([line("Delivered", STARTERS), line("Pending", DESSERTS)]))

		expect(started.getTime()).toBe(at(DESSERTS))
	})

	it("falls back to the order's last change when no dish carries a time (sent before the field existed)", () => {
		const started = timerStart(order([line("Pending", null)]))

		expect(started.getTime()).toBe(at("2026-11-01 15:02:00"))
	})

	it("falls back to the creation when the order has no last change", () => {
		const started = timerStart(order([], { modified: null }))

		expect(started.getTime()).toBe(at("2026-11-01 11:55:00"))
	})
})

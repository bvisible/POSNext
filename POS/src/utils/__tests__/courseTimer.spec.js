/**
 * //// Neoffice — added file (no upstream equivalent). The timer of a kitchen ticket counts from the course the kitchen is working on (NeoResto lot 1, Daniel, 01.11: « il faudrait afficher le temps
 * //// maintenant du départ du dessert »): the oldest send among the dishes still to cook, else the latest send, else the order's last change. Read without a screen.
 */
import { describe, expect, it } from "vitest"
import { courseSentAt, earliestSendAt, latestSendAt, linesOfLatestSend, timerStart } from "../courseTimer"

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

//// Neoffice — the most recent send of a ticket, for the kitchen's notice that the next course is ordered (Daniel, 01.11)
describe("the most recent send of a ticket", () => {
	it("is the latest time among the dishes that left, whatever their state", () => {
		const lines = [line("Delivered", STARTERS), line("Ready", MAINS), line("Pending", DESSERTS)]

		expect(latestSendAt(lines)).toBe(at(DESSERTS))
		expect(latestSendAt([line("Delivered", STARTERS), line("Delivered", MAINS)])).toBe(at(MAINS))
	})

	it("ignores a dish held back by the waiter, which has not left", () => {
		expect(latestSendAt([line("Pending", STARTERS), line("Waiting", DESSERTS), line("", DESSERTS)])).toBe(at(STARTERS))
	})

	it("says nothing when no dish that left carries a time", () => {
		expect(latestSendAt([line("Pending", null), line("Delivered", "")])).toBeNaN()
		expect(latestSendAt([])).toBeNaN()
		expect(latestSendAt(undefined)).toBeNaN()
	})

	it("gives back the dishes that left together in it, the very same instant", () => {
		const dessert = line("Pending", DESSERTS)
		const coffee = line("Pending", "2026-11-01 15:00:00.000000")
		const lines = [line("Delivered", STARTERS), dessert, line("Ready", MAINS), coffee, line("Waiting", DESSERTS)]

		expect(linesOfLatestSend(lines)).toEqual([dessert, coffee])
	})

	it("gives back nothing when there is no send to speak of", () => {
		expect(linesOfLatestSend([line("Waiting", DESSERTS), line("Pending", null)])).toEqual([])
		expect(linesOfLatestSend(undefined)).toEqual([])
	})
})

//// Neoffice — where the kitchen prepares ahead (NeoResto lot 1, the service rhythm, Daniel, 01.11): a dish sent ahead counts from the room's CALL, and counts for nothing until it comes
describe("the dishes sent ahead of their course", () => {
	const CALLED = "2026-11-01 13:10:00.000000"
	const ahead = (status, sentAt, calledAt = null) => ({
		item_code: `${status}-ahead-${sentAt}`,
		kds_status: status,
		kds_sent_at: sentAt,
		kds_ahead: 1,
		kds_called_at: calledAt,
	})

	it("count for nothing while their course is not called: no timer starts from them", () => {
		const lines = [line("Delivered", STARTERS), ahead("Pending", STARTERS), ahead("Preparing", STARTERS)]

		expect(courseSentAt(lines)).toBe(at(STARTERS))
		expect(courseSentAt([ahead("Pending", STARTERS)])).toBeNaN()
		expect(latestSendAt([ahead("Ready", STARTERS)])).toBeNaN()
		expect(linesOfLatestSend([ahead("Pending", STARTERS)])).toEqual([])
	})

	it("do not pull the timer back to the start of the meal when the first course is long gone", () => {
		const lines = [line("Preparing", MAINS), ahead("Pending", STARTERS), ahead("Ready", STARTERS)]

		expect(courseSentAt(lines)).toBe(at(MAINS))
	})

	it("count from the call once it comes, not from the moment they left", () => {
		const called = ahead("Pending", STARTERS, CALLED)

		expect(courseSentAt([line("Delivered", STARTERS), called])).toBe(at(CALLED))
		expect(latestSendAt([line("Delivered", STARTERS), called])).toBe(at(CALLED))
		expect(linesOfLatestSend([line("Delivered", STARTERS), called])).toEqual([called])
	})

	it("count from the call even when the kitchen finished them long before: they are waiting at the pass since the call", () => {
		const done = ahead("Ready", STARTERS, CALLED)

		expect(courseSentAt([line("Delivered", STARTERS), done])).toBe(at(CALLED))
	})

	it("make the timer of a ticket start at the call of the course the room wants now", () => {
		const items = [line("Delivered", STARTERS), ahead("Preparing", STARTERS, CALLED), ahead("Pending", STARTERS)]
		const started = timerStart({ creation: "2026-11-01 11:55:00", modified: "2026-11-01 15:02:00", items })

		expect(started.getTime()).toBe(at(CALLED))
	})

	it("leave a line sent in the ordinary way as it always was, whatever its call field says", () => {
		const plain = { ...line("Pending", MAINS), kds_ahead: 0, kds_called_at: CALLED }

		expect(courseSentAt([plain])).toBe(at(MAINS))
	})

	it("tell the earliest send of the dishes that count, the uncalled ones not among them", () => {
		expect(earliestSendAt([line("Delivered", STARTERS), ahead("Pending", "2026-11-01 11:00:00.000000"), line("Pending", MAINS)])).toBe(at(STARTERS))
	})
})

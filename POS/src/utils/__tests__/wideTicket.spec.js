/**
 * //// Neoffice — added file (no upstream equivalent). The wide card of a long ticket (NeoRestau lot 1, task 38a-3, ruling 107 layer 2): the rules that say which tickets take two
 * //// card widths and where. A ticket with MORE than `WIDE_TICKET_LINES` dishes is wide, on a screen that holds at least `WIDE_MIN_COLUMNS` columns of tickets; the dishes it counts are
 * //// the ones sent, not the preview announced under « Coming next ». jsdom has no layout engine: widths are given by hand.
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest"
import {
	cardWidthOf,
	columnsThatFit,
	isWideTicket,
	kitchenLineCount,
	runnerLineCount,
	WIDE_MIN_COLUMNS,
	WIDE_TICKET_LINES,
} from "@/utils/wideTicket"

const dishes = (count, status = "Preparing") =>
	Array.from({ length: count }, (_, index) => ({
		item_code: `D${index}`,
		kds_status: status,
	}))

afterEach(() => {
	document.body.innerHTML = ""
})

describe("the number of dishes that makes a ticket wide", () => {
	it("is 12, in one place: a ticket of 12 is not wide, one of 13 is", () => {
		expect(WIDE_TICKET_LINES).toBe(12)
		expect(isWideTicket(12, 4)).toBe(false)
		expect(isWideTicket(13, 4)).toBe(true)
		expect(isWideTicket(0, 4)).toBe(false)
	})

	it("needs three columns of room: a long ticket on a screen of two stays one width, where it would leave no room beside it", () => {
		expect(WIDE_MIN_COLUMNS).toBe(3)
		expect(isWideTicket(24, 2)).toBe(false)
		expect(isWideTicket(24, 1)).toBe(false)
		expect(isWideTicket(24, 3)).toBe(true)
		expect(isWideTicket(24, 6)).toBe(true)
	})

	it("is never wide while the area has not been measured (0 columns)", () => {
		expect(isWideTicket(40, 0)).toBe(false)
	})
})

describe("the dishes a ticket counts", () => {
	it("are the ones sent to the stations, whatever their state: a delivered dish stays on the card, struck through, and takes its line", () => {
		const order = {
			items: [
				...dishes(5, "Pending"),
				...dishes(4, "Preparing"),
				...dishes(2, "Ready"),
				...dishes(1, "Delivered"),
			],
		}
		expect(kitchenLineCount(order)).toBe(12)
	})

	it("do not include the dishes still held back (« Waiting »): that is a preview under « Coming next », not the ticket", () => {
		const order = {
			items: [...dishes(10, "Preparing"), ...dishes(6, "Waiting")],
		}
		expect(kitchenLineCount(order)).toBe(10)
		expect(isWideTicket(kitchenLineCount(order), 4)).toBe(false)
	})

	it("count nothing for an order with no dishes, and a dish with no state is not sent", () => {
		expect(kitchenLineCount({})).toBe(0)
		expect(kitchenLineCount(null)).toBe(0)
		expect(kitchenLineCount({ items: [{ item_code: "X" }] })).toBe(0)
	})

	it("are all of a runner card's dishes, by table or by station", () => {
		expect(runnerLineCount({ items: dishes(13, "Ready") })).toBe(13)
		expect(runnerLineCount({})).toBe(0)
		expect(runnerLineCount(undefined)).toBe(0)
	})
})

describe("how many tickets fit a row", () => {
	it("is the number of cards and gaps that fit: n cards and n - 1 gaps of 8 px", () => {
		// Compact, 250 px: 3 cards need 250 * 3 + 16 = 766 px
		expect(columnsThatFit(766, 250)).toBe(3)
		expect(columnsThatFit(765, 250)).toBe(2)
		expect(columnsThatFit(249, 250)).toBe(0)
		expect(columnsThatFit(250, 250)).toBe(1)
		// A 1366 px screen, its area 1342 px wide (12 px of margin each side): five Compact tickets, three Large ones
		expect(columnsThatFit(1342, 250)).toBe(5)
		expect(columnsThatFit(1342, 330)).toBe(3)
		// 1024 px: three Compact, two Large
		expect(columnsThatFit(1000, 250)).toBe(3)
		expect(columnsThatFit(1000, 330)).toBe(2)
	})

	it("is none for an area with no width (not laid out) or a ticket with none", () => {
		expect(columnsThatFit(0, 250)).toBe(0)
		expect(columnsThatFit(-5, 250)).toBe(0)
		expect(columnsThatFit(1000, 0)).toBe(0)
		expect(columnsThatFit(Number.NaN, 250)).toBe(0)
	})

	it("takes the width of a ticket from the page's text size, which sets --kds-card-w on its root and passes it down", () => {
		const root = document.createElement("div")
		root.style.setProperty("--kds-card-w", "330px")
		const area = document.createElement("div")
		root.appendChild(area)
		document.body.appendChild(root)

		expect(cardWidthOf(area)).toBe(330)
	})

	it("falls back to Compact's 250 px when no page sets a size (a card drawn on its own), and for an element that is not there", () => {
		const area = document.createElement("div")
		document.body.appendChild(area)

		expect(cardWidthOf(area)).toBe(250)
		expect(cardWidthOf(null)).toBe(250)
	})
})

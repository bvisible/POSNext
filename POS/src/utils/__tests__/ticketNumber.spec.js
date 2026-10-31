/**
 * //// Neoffice — added file (no upstream equivalent). How a ticket number is written on a service screen (NeoRestau lot 1, task 38b,
 * //// rulings 122 and 124): the server sends the whole number and the digits, the screen pads it.
 */
import { describe, expect, it } from "vitest"
import { formatTicketNo } from "../ticketNumber"

describe("a ticket number as the screens write it", () => {
	it("is padded with zeros to the restaurant's digits", () => {
		expect(formatTicketNo(7, 4)).toBe("0007")
		expect(formatTicketNo(12, 4)).toBe("0012")
		expect(formatTicketNo(7, 2)).toBe("07")
		expect(formatTicketNo("7", 3)).toBe("007")
	})

	it("is never cut when it is longer than its digits", () => {
		expect(formatTicketNo(12345, 4)).toBe("12345")
	})

	it("is written as it comes when the digits are not told, or told wrong", () => {
		expect(formatTicketNo(7)).toBe("7")
		expect(formatTicketNo(7, null)).toBe("7")
		expect(formatTicketNo(7, 0)).toBe("7")
		expect(formatTicketNo("0007")).toBe("0007")
	})

	it("keeps a reference that is not a number as it is", () => {
		expect(formatTicketNo("T0042", 4)).toBe("T0042")
	})

	it("is nothing when the order has no ticket: no guess, and never the invoice's name", () => {
		expect(formatTicketNo(null, 4)).toBe("")
		expect(formatTicketNo(undefined, 4)).toBe("")
		expect(formatTicketNo(0, 4)).toBe("")
		expect(formatTicketNo("", 4)).toBe("")
	})
})

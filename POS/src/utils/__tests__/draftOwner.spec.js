/**
 * //// Neoffice — added file (no upstream equivalent). Whose a held ticket is (NeoResto lot 1, the product owner, 08.11.2026): signing out no longer erases the tickets held on the device,
 * //// so each carries its owner and is shown to him alone; a ticket held before owners were kept is shown to whoever signs in.
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest"

import { currentUser, draftIsMine, withOwner } from "../draftOwner"

const setCookie = (user) => {
	document.cookie = `user_id=${user}; path=/`
}

afterEach(() => {
	document.cookie = "user_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
})

describe("the user of the session", () => {
	it("is the one the cookie names", () => {
		setCookie("waiter@yopmail.com")

		expect(currentUser()).toBe("waiter@yopmail.com")
	})

	it("is nobody for a visitor, or without a cookie", () => {
		setCookie("Guest")
		expect(currentUser()).toBe("")
		document.cookie = "user_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
		expect(currentUser()).toBe("")
	})
})

describe("whose a held ticket is", () => {
	it("is the user's when he wrote it, and not when a colleague did", () => {
		expect(draftIsMine({ owner: "a@x" }, "a@x")).toBe(true)
		expect(draftIsMine({ owner: "b@x" }, "a@x")).toBe(false)
	})

	it("is everybody's when it carries no owner (held before owners were kept), or when nobody is known", () => {
		expect(draftIsMine({}, "a@x")).toBe(true)
		expect(draftIsMine({ owner: "b@x" }, "")).toBe(true)
		expect(draftIsMine(null, "a@x")).toBe(true)
	})

	it("is read from the session by default", () => {
		setCookie("a@x")

		expect(draftIsMine({ owner: "a@x" })).toBe(true)
		expect(draftIsMine({ owner: "b@x" })).toBe(false)
	})
})

describe("the data of a ticket held", () => {
	it("carries its owner, the other fields untouched", () => {
		expect(withOwner({ items: [1], customer: "c" }, "a@x")).toEqual({ items: [1], customer: "c", owner: "a@x" })
	})

	it("carries none when nobody is known", () => {
		expect(withOwner({ items: [1] }, "")).toEqual({ items: [1] })
	})
})

/**
 * //// Neoffice — added file (no upstream equivalent). The five ends of an open order when the service closes (NeoResto lot 1, the product owner, 08.11.2026): what each asks for,
 * //// which ones an order is offered, and when the form is complete.
 */
import { beforeAll, describe, expect, it } from "vitest"

import {
	CANCELLED,
	CASHED,
	ISSUES,
	LOSS,
	OFFERED,
	TAB,
	canBeSettled,
	formIsComplete,
	issuesOf,
	needsCustomer,
	needsReason,
	settledText,
} from "../settleOrder"

beforeAll(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

const open = (...keys) =>
	Object.fromEntries(ISSUES.map((key) => [key, { available: keys.includes(key), why: keys.includes(key) ? null : "Not here" }]))

describe("what an issue asks for", () => {
	it("a reason to offer, write off or cancel: what gives something away or deletes an order is explained", () => {
		expect([OFFERED, LOSS, CANCELLED].map(needsReason)).toEqual([true, true, true])
		expect([CASHED, TAB].map(needsReason)).toEqual([false, false])
	})

	it("a customer to put an order on a tab, and for nothing else", () => {
		expect(ISSUES.filter(needsCustomer)).toEqual([TAB])
	})
})

describe("the issues of an order", () => {
	it("are the five of the study, in its order, with their words", () => {
		const issues = issuesOf({ issues: open(...ISSUES) })

		expect(issues.map((issue) => issue.key)).toEqual(["cashed", "tab", "offered", "loss", "cancelled"])
		expect(issues.every((issue) => issue.label && issue.hint && issue.confirm)).toBe(true)
	})

	it("carry what the server says: available, or why not", () => {
		const issues = issuesOf({ issues: open(CASHED) })

		expect(issues.find((issue) => issue.key === CASHED)).toMatchObject({ available: true, why: "" })
		expect(issues.find((issue) => issue.key === LOSS)).toMatchObject({ available: false, why: "Not here" })
	})

	it("are none when the server said nothing (an older answer)", () => {
		expect(issuesOf({}).every((issue) => !issue.available)).toBe(true)
		expect(issuesOf(null).every((issue) => !issue.available)).toBe(true)
		expect(canBeSettled({})).toBe(false)
	})

	it("can be settled when at least one is open", () => {
		expect(canBeSettled({ issues: open(CANCELLED) })).toBe(true)
		expect(canBeSettled({ issues: open() })).toBe(false)
	})
})

describe("the form", () => {
	const order = { issues: open(CASHED, TAB, OFFERED, LOSS, CANCELLED) }

	it("is complete for an issue that asks nothing", () => {
		expect(formIsComplete(order, { issue: CASHED })).toBe(true)
	})

	it("needs a reason where one is asked, spaces being none", () => {
		expect(formIsComplete(order, { issue: CANCELLED, reason: "" })).toBe(false)
		expect(formIsComplete(order, { issue: CANCELLED, reason: "   " })).toBe(false)
		expect(formIsComplete(order, { issue: CANCELLED, reason: "Left" })).toBe(true)
	})

	it("needs a customer for a tab", () => {
		expect(formIsComplete(order, { issue: TAB })).toBe(false)
		expect(formIsComplete(order, { issue: TAB, customer: "CUST-1" })).toBe(true)
	})

	it("is never complete for an issue the order does not allow, nor for none", () => {
		expect(formIsComplete({ issues: open(CASHED) }, { issue: LOSS, reason: "Left" })).toBe(false)
		expect(formIsComplete(order, { issue: "" })).toBe(false)
		expect(formIsComplete(order, { issue: "forgiven", reason: "x" })).toBe(false)
	})
})

describe("what the till says once it is settled", () => {
	it("names the order and how it ended", () => {
		expect(settledText(CASHED, "T4")).toBe("T4 cashed in cash")
		expect(settledText(TAB, "T4")).toBe("T4 put on the customer's tab")
		expect(settledText(OFFERED, "T4")).toBe("T4 offered")
		expect(settledText(LOSS, "T4")).toBe("T4 written off as a customer's loss")
		expect(settledText(CANCELLED, "T4")).toBe("T4 cancelled")
	})
})

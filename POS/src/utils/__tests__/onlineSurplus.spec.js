//// Neoffice — added file (no upstream equivalent). What a customer paid online beyond the sale is not cash change (NeoSalon, voie 4, 19.11.2026).
import { describe, expect, it } from "vitest"
import { cashChangeOf, coversTheSale, onlineSurplusOf } from "../onlineSurplus"

describe("the online money beyond a sale", () => {
	it("is nothing while the sale needs all of it", () => {
		expect(onlineSurplusOf(0, 40)).toBe(0)
		expect(onlineSurplusOf(20, 40)).toBe(0)
		expect(onlineSurplusOf(40, 40)).toBe(0)
	})

	it("is what was paid online above what the sale asks", () => {
		expect(onlineSurplusOf(50, 40)).toBe(10)
		expect(onlineSurplusOf(50, 0)).toBe(50)
		expect(onlineSurplusOf(33.3, 33.1)).toBe(0.2)
	})

	it("reads a missing or odd amount as nothing", () => {
		expect(onlineSurplusOf(undefined, 40)).toBe(0)
		expect(onlineSurplusOf("x", 40)).toBe(0)
		expect(onlineSurplusOf(null, null)).toBe(0)
	})
})

describe("the cash change of a sale partly paid online", () => {
	it("is what the till collected beyond what was due, as for any sale", () => {
		expect(cashChangeOf(50, 40, 0)).toBe(10)
		expect(cashChangeOf(40, 40, 0)).toBe(0)
		expect(cashChangeOf(30, 40, 0)).toBe(0)
	})

	it("never counts the online surplus as change: it is not in the drawer", () => {
		// 50 paid online for a sale that shrank to 40: nothing to hand back in cash
		expect(cashChangeOf(50, 40, onlineSurplusOf(50, 40))).toBe(0)
		// a customer who also gave 5 in cash that nothing asked for: that 5 is change
		expect(cashChangeOf(55, 40, onlineSurplusOf(50, 40))).toBe(5)
	})

	it("is still change for the cash that exceeds what remained after the online part", () => {
		// 20 online, 40 due, 30 in cash: 10 back
		expect(cashChangeOf(50, 40, onlineSurplusOf(20, 40))).toBe(10)
	})
})

describe("a sale that what was paid ahead online covers", () => {
	it("is covered when the online money reaches the sale, or goes beyond it", () => {
		expect(coversTheSale(40, 40)).toBe(true)
		expect(coversTheSale(50, 40)).toBe(true)
		expect(coversTheSale(33.3, 33.3)).toBe(true)
	})

	it("is not covered while the sale needs more than was paid", () => {
		expect(coversTheSale(30, 40)).toBe(false)
		expect(coversTheSale(39.99, 40)).toBe(false)
	})

	it("is never covered by nothing, nor by an odd amount", () => {
		expect(coversTheSale(0, 0)).toBe(false)
		expect(coversTheSale(undefined, 40)).toBe(false)
		expect(coversTheSale("x", 40)).toBe(false)
		expect(coversTheSale(null, null)).toBe(false)
	})
})

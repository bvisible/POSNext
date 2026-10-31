/**
 * //// Neoffice — added file (no upstream equivalent). « Offert » (NeoRestau lot 1, task 24): the cashier offers some or
 * //// all of a line's quantity. The offered part is a row of its own, of the same dish (item, unit, options, remark, kitchen
 * //// state), that keeps its list price at a 100 % discount; the cart shows it under its paid line.
 */
import { describe, expect, it } from "vitest"
import { cartRowOf } from "@/utils/cartRow"
import { nestFreeRows } from "@/utils/gwpSameItemFreeRows"
import {
	canOfferRow,
	clampOfferQuantity,
	followsItsPaidLine,
	isOfferedRow,
	kitchenFollowers,
	makeOfferedRow,
	mergeTarget,
	nestOfferedRows,
	offerBounds,
	offeredLineFields,
	offeredSourceFields,
	offeredSummary,
	offeredValue,
	sameDish,
	withoutOfferedRows,
} from "@/utils/offeredRows"

const tiramisu = (changes = {}) => ({
	item_code: "TIRAMISU",
	item_name: "Tiramisu",
	rate: 9.5,
	price_list_rate: 9.5,
	quantity: 3,
	uom: "Nos",
	stock_uom: "Nos",
	discount_percentage: 0,
	discount_amount: 0,
	pricing_rules: [],
	kds_status: "Pending",
	preparation_station: "Kitchen",
	posa_item_modifiers: "",
	posa_special_instructions: "",
	...changes,
})

describe("an offered row", () => {
	it("is told by its own flag, never by a zero price", () => {
		expect(isOfferedRow({ posa_is_offered: 1 })).toBe(true)
		expect(isOfferedRow({ posa_is_offered: true })).toBe(true)
		expect(isOfferedRow({ posa_is_offered: 0, rate: 0 })).toBe(false)
		// ERPNext's free row of a promotion is something else
		expect(isOfferedRow({ is_free_item: 1, rate: 0 })).toBe(false)
		expect(isOfferedRow(null)).toBe(false)
	})

	it("is made of the same dish, its kitchen state included, for the quantity offered", () => {
		const line = tiramisu({
			posa_item_modifiers: '[{"group":"Sauce","options":[{"name":"Coulis"}]}]',
			posa_special_instructions: "No cocoa",
		})
		const offered = makeOfferedRow(line, 1)
		expect(offered).not.toBe(line)
		expect(offered).toMatchObject({
			item_code: "TIRAMISU",
			uom: "Nos",
			quantity: 1,
			posa_is_offered: 1,
			price_list_rate: 9.5,
			rate: 9.5,
			discount_percentage: 100,
			kds_status: "Pending",
			preparation_station: "Kitchen",
			posa_item_modifiers: line.posa_item_modifiers,
			posa_special_instructions: "No cocoa",
			is_free_item: 0,
		})
		// The line it comes from is left as it is: the cart changes it
		expect(line.quantity).toBe(3)
	})

	it("keeps the list price, not a rate the cashier edited, and none of a promotion's or a coupon's fields", () => {
		const line = tiramisu({
			rate: 8,
			is_rate_manually_edited: 1,
			original_rate: 9.5,
			pricing_rules: ["PRLE-0001"],
			discount_percentage: 10,
			coupon_code: "WELCOME",
			discount_source: "coupon",
			pre_coupon_discount: { discount_percentage: 10 },
			free_qty: 1,
		})
		const offered = makeOfferedRow(line, 1)
		expect(offered.rate).toBe(9.5)
		expect(offered.is_rate_manually_edited).toBe(0)
		expect(offered.original_rate).toBeNull()
		expect(offered.pricing_rules).toEqual([])
		expect(offered.discount_percentage).toBe(100)
		expect(offered.coupon_code).toBeNull()
		expect(offered.pre_coupon_discount).toBeNull()
		expect(offered.discount_source).toBe("")
		expect(offered.free_qty).toBe(0)
	})

	it("from a line that comes offered (a table's draft, a held cart) carries its flag, list price and 100 %", () => {
		// The server row of a table's draft: the rate it holds is 0, the list price is its own
		expect(
			offeredLineFields({ posa_is_offered: 1, rate: 0, price_list_rate: 9.5 }),
		).toMatchObject({
			posa_is_offered: 1,
			price_list_rate: 9.5,
			rate: 9.5,
			discount_percentage: 100,
		})
		expect(offeredLineFields({ posa_is_offered: 0, rate: 9.5 })).toEqual({})
		// What a loader adds to its line: only for an offered row, a paid row keeps what it always sent
		expect(
			offeredSourceFields({
				posa_is_offered: 1,
				price_list_rate: 9.5,
				rate: 0,
			}),
		).toEqual({
			posa_is_offered: 1,
			price_list_rate: 9.5,
		})
		expect(
			offeredSourceFields({
				posa_is_offered: 0,
				price_list_rate: 12,
				rate: 10,
			}),
		).toEqual({})
	})
})

describe("what may be offered, and how much", () => {
	it("a sold line of the cart, from 1 to its quantity", () => {
		expect(canOfferRow(tiramisu())).toBe(true)
		expect(offerBounds(tiramisu())).toEqual({ min: 1, max: 3 })
		expect(clampOfferQuantity(tiramisu(), 0)).toBe(1)
		expect(clampOfferQuantity(tiramisu(), 7)).toBe(3)
		expect(clampOfferQuantity(tiramisu(), 2)).toBe(2)
		expect(clampOfferQuantity(tiramisu(), "x")).toBe(1)
	})

	it("a weighed line below 1 is offered whole", () => {
		const cheese = tiramisu({ quantity: 0.35, uom: "Kg" })
		expect(offerBounds(cheese)).toEqual({ min: 0.35, max: 0.35 })
		expect(clampOfferQuantity(cheese, 1)).toBe(0.35)
	})

	it("never a promotion's gift, an offered row, a line with serial numbers or an empty one", () => {
		expect(canOfferRow(tiramisu({ is_free_item: 1 }))).toBe(false)
		expect(canOfferRow({ ...tiramisu(), _isStandaloneFreeRow: true })).toBe(
			false,
		)
		expect(canOfferRow(tiramisu({ posa_is_offered: 1 }))).toBe(false)
		expect(
			canOfferRow(tiramisu({ has_serial_no: 1, serial_no: "SN1\nSN2\nSN3" })),
		).toBe(false)
		expect(canOfferRow(tiramisu({ quantity: 0 }))).toBe(false)
		expect(canOfferRow(null)).toBe(false)
	})
})

describe("the value offered", () => {
	it("is the list price of the offered units, the paid ones not counted", () => {
		const rows = [
			tiramisu({ quantity: 2 }),
			makeOfferedRow(tiramisu(), 1),
			makeOfferedRow(
				tiramisu({
					item_code: "ESPRESSO",
					item_name: "Espresso",
					rate: 4.2,
					price_list_rate: 4.2,
				}),
				2,
			),
		]
		expect(offeredValue(rows)).toBe(17.9)
		expect(offeredSummary(rows)).toEqual({ count: 3, value: 17.9 })
		expect(offeredSummary([tiramisu()])).toEqual({ count: 0, value: 0 })
	})
})

describe("the same dish", () => {
	it("is the same item, unit, options and remark", () => {
		expect(sameDish(tiramisu(), tiramisu({ quantity: 1 }))).toBe(true)
		expect(
			sameDish(tiramisu(), tiramisu({ posa_special_instructions: "No cocoa" })),
		).toBe(false)
		expect(sameDish(tiramisu(), tiramisu({ posa_item_modifiers: "[]x" }))).toBe(
			false,
		)
		expect(sameDish(tiramisu(), tiramisu({ uom: "Box" }))).toBe(false)
		expect(sameDish(tiramisu(), tiramisu({ item_code: "PANNA" }))).toBe(false)
		// A unit left blank reads as the stock unit
		expect(sameDish(tiramisu({ uom: "" }), tiramisu())).toBe(true)
	})
})

describe("merging an offered row back", () => {
	it("goes into its paid line when the dish, its kitchen state and its price are the same", () => {
		const paid = tiramisu({ quantity: 2 })
		const offered = makeOfferedRow(tiramisu(), 1)
		expect(mergeTarget([paid, offered], offered)).toBe(paid)
	})

	it("finds no line when the paid one went on to the kitchen without it, or was priced otherwise", () => {
		const offered = makeOfferedRow(tiramisu({ kds_status: "Waiting" }), 1)
		expect(
			mergeTarget(
				[tiramisu({ quantity: 2, kds_status: "Preparing" }), offered],
				offered,
			),
		).toBeNull()
		expect(
			mergeTarget(
				[
					tiramisu({
						quantity: 2,
						kds_status: "Waiting",
						price_list_rate: 11,
						rate: 11,
					}),
					offered,
				],
				offered,
			),
		).toBeNull()
		// Two not yet sent states are one
		expect(
			mergeTarget(
				[tiramisu({ quantity: 2, kds_status: "" }), offered],
				offered,
			),
		).not.toBeNull()
		// Never into another offered row nor a promotion's gift
		const other = makeOfferedRow(tiramisu({ kds_status: "Waiting" }), 1)
		expect(
			mergeTarget(
				[other, tiramisu({ is_free_item: 1, kds_status: "Waiting" }), offered],
				offered,
			),
		).toBeNull()
	})
})

describe("the kitchen", () => {
	it("takes the offered rows of a dish with it, those not sent yet", () => {
		const paid = tiramisu({ quantity: 2, kds_status: "Waiting" })
		const offered = makeOfferedRow(paid, 1)
		const sentAlready = makeOfferedRow(tiramisu({ kds_status: "Pending" }), 1)
		const otherDish = makeOfferedRow(
			tiramisu({ item_code: "PANNA", kds_status: "Waiting" }),
			1,
		)
		expect(
			kitchenFollowers([paid, offered, sentAlready, otherDish], paid),
		).toEqual([offered])
	})

	it("is sent through its paid line, unless it has none or that line went without it", () => {
		const unsentPaid = tiramisu({ quantity: 2, kds_status: "" })
		const follower = makeOfferedRow(unsentPaid, 1)
		expect(followsItsPaidLine([unsentPaid, follower], follower)).toBe(true)
		// A whole line offered: no paid line of its dish
		const whole = makeOfferedRow(tiramisu({ kds_status: "" }), 3)
		expect(followsItsPaidLine([whole], whole)).toBe(false)
		// Still unsent beside a paid line already at the kitchen: a dish of its own to send
		const sentPaid = tiramisu({ quantity: 2, kds_status: "Pending" })
		const leftBehind = makeOfferedRow(tiramisu({ kds_status: "" }), 1)
		expect(followsItsPaidLine([sentPaid, leftBehind], leftBehind)).toBe(false)
		// Both sent: listed once, by the paid line
		const sentOffered = makeOfferedRow(sentPaid, 1)
		expect(followsItsPaidLine([sentPaid, sentOffered], sentOffered)).toBe(true)
		// A paid line is never a follower
		expect(followsItsPaidLine([unsentPaid, follower], unsentPaid)).toBe(false)
	})
})

describe("the offers engine never sees an offered row", () => {
	it("leaves it out of the payload, in order, the rest untouched", () => {
		const data = {
			pos_profile: "Till",
			items: [
				{ item_code: "A" },
				{ item_code: "B", posa_is_offered: 1 },
				{ item_code: "C" },
			],
		}
		const sent = withoutOfferedRows(data)
		expect(sent.items.map((i) => i.item_code)).toEqual(["A", "C"])
		expect(sent.pos_profile).toBe("Till")
		expect(data.items).toHaveLength(3)
	})
})

describe("the cart shows an offered row under its paid line", () => {
	const cartOf = (...rows) => rows

	it("nested right after the paid line, whatever the cart's order, and it leads back to its cart row", () => {
		const paid = tiramisu({ quantity: 2 })
		const offered = makeOfferedRow(tiramisu(), 1)
		const espresso = tiramisu({
			item_code: "ESPRESSO",
			item_name: "Espresso",
			quantity: 1,
		})
		// Newest first: the offered row (inserted after the paid line) comes before it
		const shown = nestOfferedRows(nestFreeRows(cartOf(espresso, offered, paid)))
		expect(shown.map((l) => [l.item_code, Boolean(l.posa_is_offered)])).toEqual(
			[
				["ESPRESSO", false],
				["TIRAMISU", false],
				["TIRAMISU", true],
			],
		)
		expect(shown[2]._offeredOf).toBeTruthy()
		expect(cartRowOf(shown[2])).toBe(offered)
		expect(cartRowOf(shown[1])).toBe(paid)
	})

	it("after the paid line's own gifts", () => {
		const paid = tiramisu({ quantity: 2, pricing_rules: "PRLE-1" })
		const gift = {
			item_code: "COOKIE",
			item_name: "Cookie",
			is_free_item: 1,
			quantity: 1,
			uom: "Nos",
			pricing_rules: "PRLE-1",
		}
		const offered = makeOfferedRow(tiramisu(), 1)
		const shown = nestOfferedRows(nestFreeRows(cartOf(paid, offered, gift)))
		expect(shown.map((l) => l.item_code)).toEqual([
			"TIRAMISU",
			"COOKIE",
			"TIRAMISU",
		])
		expect(isOfferedRow(shown[2])).toBe(true)
	})

	it("a whole line offered reads « Offert » on its own", () => {
		const offered = makeOfferedRow(tiramisu(), 3)
		const shown = nestOfferedRows(nestFreeRows([offered]))
		expect(shown).toHaveLength(1)
		expect(isOfferedRow(shown[0])).toBe(true)
		expect(shown[0]._offeredOf).toBeFalsy()
		expect(cartRowOf(shown[0])).toBe(offered)
	})

	it("is never taken for the paid line a promotion's gift belongs to", () => {
		// The offered row comes first in the cart: the gift still nests under the paid line
		const offered = makeOfferedRow(tiramisu(), 1)
		const paid = tiramisu({ quantity: 2 })
		const gift = {
			item_code: "TIRAMISU",
			item_name: "Tiramisu",
			is_free_item: 1,
			quantity: 1,
			uom: "Nos",
		}
		const shown = nestFreeRows([offered, paid, gift])
		const giftShown = shown.find((l) => l.is_free_item)
		expect(shown.indexOf(giftShown)).toBe(
			shown.findIndex(
				(l) =>
					l.item_code === "TIRAMISU" && !l.is_free_item && !l.posa_is_offered,
			) + 1,
		)
	})
})

describe("the closing's line « Offerts : n articles, valeur CHF x »", () => {
	const chf = (value) => `CHF ${value.toFixed(2)}`

	it("counts the units and their value at list price, one item said in the singular", async () => {
		const { offeredClosingLine } = await import("@/utils/offeredRows")
		globalThis.__ = (s, args) =>
			args ? String(s).replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
		expect(
			offeredClosingLine({ offered_count: 3, offered_value: 17.9 }, chf),
		).toBe("Offered: 3 items, value CHF 17.90")
		expect(
			offeredClosingLine({ offered_count: 1, offered_value: 9.5 }, chf),
		).toBe("Offered: 1 item, value CHF 9.50")
		expect(
			offeredClosingLine({ offered_count: 0, offered_value: 0 }, chf),
		).toBe("")
		expect(offeredClosingLine({}, chf)).toBe("")
	})

	it("is shown by the closing dialog", async () => {
		const { readFileSync } = await import("node:fs")
		const path = await import("node:path")
		const dialog = readFileSync(
			path.resolve(__dirname, "../../components/ShiftClosingDialog.vue"),
			"utf8",
		)
		expect(dialog).toMatch(/offeredClosingLine\(closingData/)
		expect(dialog).toContain('data-test="closing-offered"')
	})
})

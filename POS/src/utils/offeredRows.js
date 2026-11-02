// //// Neoffice — added file (no upstream equivalent). « Offert » (NeoResto lot 1, task 24): the cashier offers some or all
// //// of a line's quantity. The offered part is a row of its own, of the same dish (item, unit, options, remark, kitchen
// //// state: it was ordered and maybe sent), flagged `posa_is_offered` — never ERPNext's is_free_item, which a pricing
// //// rule may strip — that keeps its list price at a 100 % discount: it charges nothing and carries no VAT, and the value
// //// offered stays readable. Every path that addresses a line by its item code (the stepper, the line dialog, a unit
// //// scanned again, the offers engine, a coupon) leaves it alone; the cart shows it under its paid line.

import { withCartRow } from "@/utils/cartRow"
import { roundCurrency } from "@/utils/currency"

/** The flag of an offered row, a field of ours on Sales Invoice Item. */
export const OFFERED_FIELD = "posa_is_offered"
/** The context of the words « Offert » and « Offrir »: the bare msgids are a promotion's « Offre » elsewhere. */
export const OFFER_CONTEXT = "Given for free"

const quantityOf = (row) => Number.parseFloat(row?.quantity ?? row?.qty) || 0
const roundQuantity = (qty) => Math.round(qty * 10000) / 10000
const text = (value) => String(value ?? "").trim()

/** Whether a row is an offered row: its own flag, never a zero price. */
export function isOfferedRow(row) {
	const flag = row?.[OFFERED_FIELD]
	return flag === true || Number(flag) === 1
}

/** A row's list price: what one unit is worth. */
export function listPrice(row) {
	return Number.parseFloat(row?.price_list_rate || row?.rate) || 0
}

/**
 * What a line that comes offered (a table's draft read from the server, a held cart, a guest's order reloaded) keeps
 * of its offer once in the cart: its flag, its list price as its rate, 100 % off. Nothing for a paid line.
 */
export function offeredLineFields(source) {
	if (!isOfferedRow(source)) return {}
	const price = listPrice(source)
	return {
		[OFFERED_FIELD]: 1,
		price_list_rate: price,
		rate: price,
		discount_percentage: 100,
		discount_amount: 0,
		discount_mode: null,
		pricing_rules: [],
		is_rate_manually_edited: 0,
		original_rate: null,
		is_free_item: 0,
		free_qty: 0,
	}
}

/**
 * What a loader of a table's draft adds to the line it hands to addItem: the row's flag and list price, for an
 * offered row only. A paid row keeps exactly what the loader always sent.
 */
export function offeredSourceFields(serverRow) {
	if (!isOfferedRow(serverRow)) return {}
	return {
		[OFFERED_FIELD]: 1,
		price_list_rate: Number.parseFloat(serverRow.price_list_rate) || 0,
	}
}

/** Whether a line of the cart may be offered: a sold line (not a promotion's gift, not offered already), not empty,
 * without serial numbers (which serial would be the offered one is not the till's to guess). */
export function canOfferRow(row) {
	if (!row || row.is_free_item || row._isStandaloneFreeRow || isOfferedRow(row))
		return false
	if (row.has_serial_no && row.serial_no) return false
	return quantityOf(row) > 0
}

/** The quantities an offer of the line may take: from 1 to its quantity; a line below 1 (weighed) is offered whole. */
export function offerBounds(row) {
	const max = quantityOf(row)
	return { min: Math.min(1, max), max }
}

/** A quantity brought within the line's bounds. */
export function clampOfferQuantity(row, qty) {
	const { min, max } = offerBounds(row)
	const value = Number.parseFloat(qty)
	if (!Number.isFinite(value)) return min
	return roundQuantity(Math.min(max, Math.max(min, value)))
}

/** Two lines are the same dish: the same item, unit, options and remark. */
export function sameDish(a, b) {
	return (
		Boolean(a && b) &&
		a.item_code === b.item_code &&
		text(a.uom || a.stock_uom) === text(b.uom || b.stock_uom) &&
		text(a.posa_item_modifiers) === text(b.posa_item_modifiers) &&
		text(a.posa_special_instructions) === text(b.posa_special_instructions)
	)
}

/** Whether a line is not at the kitchen yet. */
export function isUnsent(row) {
	return !row?.kds_status || row.kds_status === "Waiting"
}

function sameKitchenState(a, b) {
	return (
		(isUnsent(a) && isUnsent(b)) || text(a.kds_status) === text(b.kds_status)
	)
}

/** What makes a line offered in place: its flag, its list price, 100 % off, and none of a promotion's or a coupon's
 * discount (the offer replaces them). */
export function offeredFieldsOf(row) {
	return {
		...offeredLineFields({ ...row, [OFFERED_FIELD]: 1 }),
		discount_source: "",
		is_already_discounted: 0,
		is_accumulative_discount: 0,
		gwp_free_qty: 0,
		coupon_code: null,
		coupon_fixed_discount: null,
		coupon_percentage_cap: null,
		pre_coupon_discount: null,
	}
}

/**
 * The offered row made from `row` for `qty` units: a copy of the dish, its kitchen state included, offered. The
 * line itself is left as it is: the cart takes the units off it.
 */
export function makeOfferedRow(row, qty) {
	const offered = {
		...row,
		quantity: roundQuantity(Number.parseFloat(qty) || 0),
		...offeredFieldsOf(row),
	}
	// The copy is a new row of the cart: nothing of the line's own identity nor of a discount it derived
	for (const key of [
		"name",
		"idx",
		"_derived_discount_percentage",
		"posa_row_id",
	])
		delete offered[key]
	return offered
}

/**
 * The paid line an offered row goes back into on « Annuler l'offert »: the same dish, in the same kitchen state, at the
 * same price, warehouse and batch. None: the row turns back into a paid line where it is.
 */
export function mergeTarget(rows, offered) {
	return (
		(rows || []).find(
			(row) =>
				row !== offered &&
				!isOfferedRow(row) &&
				!row.is_free_item &&
				!(row.has_serial_no && row.serial_no) &&
				sameDish(row, offered) &&
				sameKitchenState(row, offered) &&
				listPrice(row) === listPrice(offered) &&
				text(row.warehouse) === text(offered.warehouse) &&
				text(row.batch_no) === text(offered.batch_no),
		) || null
	)
}

/** What the offered rows are worth, at list price. */
export function offeredValue(rows) {
	return roundCurrency(
		(rows || [])
			.filter(isOfferedRow)
			.reduce(
				(sum, row) => sum + roundCurrency(quantityOf(row) * listPrice(row)),
				0,
			),
	)
}

/** The offered units and their value at list price. */
export function offeredSummary(rows) {
	const offered = (rows || []).filter(isOfferedRow)
	return {
		count: roundQuantity(
			offered.reduce((sum, row) => sum + quantityOf(row), 0),
		),
		value: offeredValue(offered),
	}
}

/** The closing's line « Offerts : n articles, valeur CHF x », from the closing data; "" when nothing was offered. */
export function offeredClosingLine(closing, formatAmount) {
	const count = Number.parseFloat(closing?.offered_count) || 0
	if (!count) return ""
	const value = formatAmount(Number.parseFloat(closing?.offered_value) || 0)
	return count === 1
		? __("Offered: {0} item, value {1}", [count, value])
		: __("Offered: {0} items, value {1}", [count, value])
}

/** The offered rows of a dish that go to the kitchen with its paid line: the same dish, not sent yet. */
export function kitchenFollowers(rows, paidRow) {
	return (rows || []).filter(
		(row) =>
			row !== paidRow &&
			isOfferedRow(row) &&
			sameDish(row, paidRow) &&
			isUnsent(row),
	)
}

/**
 * Whether an offered row reaches the kitchen through a paid line of its dish, and so is not listed on its own by the
 * send dialog: that line is not sent yet (the row follows it, kitchenFollowers), or both are already sent. A whole line
 * offered (no paid line), or an offered row still unsent beside a paid line already sent, is a dish of its own to send.
 */
export function followsItsPaidLine(rows, offered) {
	return (
		isOfferedRow(offered) &&
		(rows || []).some(
			(row) =>
				row !== offered &&
				!row.is_free_item &&
				!isOfferedRow(row) &&
				sameDish(row, offered) &&
				(isUnsent(row) || !isUnsent(offered)),
		)
	)
}

/** The offers payload without the offered rows: the offers engine never prices nor counts what is offered. */
export function withoutOfferedRows(invoiceData) {
	if (!invoiceData || !Array.isArray(invoiceData.items)) return invoiceData
	return {
		...invoiceData,
		items: invoiceData.items.filter((item) => !isOfferedRow(item)),
	}
}

/**
 * The cart's lines as it shows them (after nestFreeRows), each offered row right after its paid line and that line's
 * gifts, marked `_offeredOf`; an offered row whose dish has no paid line (a whole line offered) stays where it is. Every
 * line shown leads back to its cart row (utils/cartRow.js).
 */
export function nestOfferedRows(lines) {
	const rows = lines || []
	const isPaidLine = (line) =>
		!line.is_free_item && !line._isStandaloneFreeRow && !isOfferedRow(line)
	const children = new Map()
	const nested = new Set()
	for (const line of rows) {
		if (!isOfferedRow(line)) continue
		const parent = rows.find(
			(candidate) => isPaidLine(candidate) && sameDish(candidate, line),
		)
		if (!parent) continue
		nested.add(line)
		const copy = withCartRow(
			{ ...line, _offeredOf: `${parent.item_code}-${parent.uom || ""}` },
			line,
		)
		children.set(parent, [...(children.get(parent) || []), copy])
	}
	const out = []
	for (let index = 0; index < rows.length; index++) {
		const line = rows[index]
		if (nested.has(line)) continue
		out.push(line)
		if (!children.has(line)) continue
		// After the paid line come its own gifts (nestFreeRows put them there), then its offered rows
		while (
			index + 1 < rows.length &&
			rows[index + 1]._isStandaloneFreeRow &&
			rows[index + 1]._giftOf
		) {
			index += 1
			out.push(rows[index])
		}
		out.push(...children.get(line))
	}
	return out
}

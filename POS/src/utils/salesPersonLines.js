//// Neoffice — added file (no upstream equivalent). Which lines of a cart ask for a sales person, and in which words (NeoSalon, lot G1, product owner, 09.11.2026).
//// The rule is the server's (`validate_sales_person_coverage`, pos_next.sales_person_lines) and the till must agree with it, or the cashier is blocked where the server
//// would let the sale through, or lets it go and is refused at the end: a free line and a line worth nothing ask for none, a service always asks, a product only if the
//// till follows the sales of products by person too. This file holds the rule so that the cart, the payment and the spec read the same one.
import { kindOf, PRODUCT, SERVICE, siteTellsTheKinds } from "@/utils/itemKinds"

/** The line is free or worth nothing: the server asks no person of it (a net of zero). */
export function lineIsWorthNothing(line) {
	if (!line) return true
	if (line.is_free_item) return true
	if (Number(line.discount_percentage) >= 100) return true
	return (
		Math.abs(
			(Number(line.rate) || 0) * (Number(line.quantity ?? line.qty) || 0),
		) < 0.0001
	)
}

/** @returns "service", "product" or "" for a line (what the site says of its item; "" when it says nothing or has not answered yet) */
export function kindOfLine(line) {
	return kindOf(line?.item_code) || ""
}

/**
 * Whether a line must name its person: a service always (a line the site does not name is one), a product only when products are tracked.
 * @param {object} line - a cart line
 * @param {{ productsTracked: boolean }} options
 */
export function lineAsksForAPerson(line, { productsTracked = false } = {}) {
	if (lineIsWorthNothing(line)) return false
	if (productsTracked) return true
	return kindOfLine(line) !== PRODUCT
}

/** The lines that ask for a person and have none. */
export function linesWithoutTheirPerson(lines, options) {
	return (lines || []).filter(
		(line) => lineAsksForAPerson(line, options) && !line.sales_person,
	)
}

/** Whether every line that asks for a person has one (nothing asks: true). */
export function everyLineHasItsPerson(lines, options) {
	return linesWithoutTheirPerson(lines, options).length === 0
}

/** Two lines merge only when they name the same person: two « Cut » of two hairdressers are two lines, each with its own commission. */
export function sameLinePerson(a, b) {
	return (a?.sales_person || null) === (b?.sales_person || null)
}

/**
 * The question the cashier reads, in the words of what was done. A site that tells services from products says « Who did the work? » of a service
 * and « Who sold it? » of a product; a site that does not keeps the ordinary « Sales Person » (a shop, a restaurant).
 * @param {string} kind - "service", "product" or "" for what is asked about
 * @param {boolean} [told] - whether the site tells the kinds (default: it is read from the kinds loaded)
 */
export function whoLabel(kind, told = siteTellsTheKinds()) {
	if (!told) return __("Sales Person")
	return kind === PRODUCT
		? __("Who sold it?", null, "Sales persons")
		: __("Who did the work?", null, "Sales persons")
}

/** The kind to word a question about several lines: a service if any line is one (or none is known), a product only if all are. */
export function kindOfLines(lines) {
	const kinds = (lines || [])
		.filter((line) => !lineIsWorthNothing(line))
		.map(kindOfLine)
	return kinds.length > 0 && kinds.every((kind) => kind === PRODUCT)
		? PRODUCT
		: SERVICE
}

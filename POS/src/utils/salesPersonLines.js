//// Neoffice — added file (no upstream equivalent). Which lines of a cart ask for a sales person, and in which words (NeoSalon, lot G1, product owner, 09.11.2026).
//// The rule is the server's (`validate_sales_person_coverage`, pos_next.sales_person_lines) and the till must agree with it, or the cashier is blocked where the server
//// would let the sale through, or lets it go and is refused at the end: a free line and a line worth nothing ask for none, a service always asks, a product only if the
//// till follows the sales of products by person too. This file holds the rule so that the cart, the payment and the spec read the same one.
import { kindOf, PRODUCT, SERVICE, siteQuestion, siteTellsTheKinds } from "@/utils/itemKinds"

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

/**
 * Whether nobody can be chosen: the list the till offers was read (online, answered) and holds nobody. A list not read yet, or whose read failed,
 * says nothing: the person is still asked for, as the server asks for it where somebody is offered.
 * @param {{ listRead: boolean, offered: number }} list
 */
export function nobodyCanBeChosen({ listRead = false, offered = 0 } = {}) {
	return Boolean(listRead) && Number(offered) === 0
}

/**
 * Whether the payment window asks for a sales person of the whole sale (the red star, the blocked button): the till follows sales persons, it is online
 * (a sale kept offline is not blocked: the list cannot be read), some line asks for a person and not every one of them has hers, and somebody can be
 * chosen. Where the list the till offers is empty the server asks for nobody either (neoffice-maintenance#3109): a required field that nobody can fill
 * blocks a sale for nothing.
 * @param {{ enabled: boolean, offline: boolean, lines: object[], productsTracked: boolean, listRead: boolean, offered: number }} sale
 */
export function salesPersonIsRequired({
	enabled,
	offline = false,
	lines,
	productsTracked = false,
	listRead = false,
	offered = 0,
}) {
	if (!enabled || offline) return false
	if (everyLineHasItsPerson(lines, { productsTracked })) return false
	return !nobodyCanBeChosen({ listRead, offered })
}

//// Neoffice — the lines that name their person keep it, and the choice of the whole sale only reaches the others (neoffice-maintenance#3184). The server shares the
//// invoice's choice among the lines that have no person (`build_sales_team_from_items`): when every line has one the choice has nothing to apply to, and a picker that
//// takes a name and drops it silently is worse than no picker. These rules say which lines the choice reaches, so the window shows the people instead of a picker that does nothing.

/** The lines the choice of the whole sale could reach: those worth something (a free line shares no commission). */
export function billableLines(lines) {
	return (lines || []).filter((line) => !lineIsWorthNothing(line))
}

/** Every billable line names its person: the choice of the whole sale would reach none of them. */
export function everyLineKeepsItsPerson(lines) {
	const billable = billableLines(lines)
	return billable.length > 0 && billable.every((line) => Boolean(line.sales_person))
}

/** Some billable lines name their person and some do not: the choice of the whole sale reaches the others only. */
export function someLinesKeepTheirPerson(lines) {
	const billable = billableLines(lines)
	return billable.some((line) => line.sales_person) && billable.some((line) => !line.sales_person)
}

/** The people the billable lines name, each once, in the order of the cart. */
export function personsOfTheLines(lines) {
	const seen = new Map()
	for (const line of billableLines(lines)) {
		if (line.sales_person && !seen.has(line.sales_person)) {
			seen.set(line.sales_person, {
				sales_person: line.sales_person,
				sales_person_name: line.sales_person_name || line.sales_person,
			})
		}
	}
	return [...seen.values()]
}

/** The team the sale sends as its own: none where every line names its person (nothing to apply it to), what was chosen otherwise. */
export function salesTeamOfTheSale({ lines, selected }) {
	return everyLineKeepsItsPerson(lines) ? [] : selected || []
}

/**
 * What the window says of the people the lines name. A site that tells services from products speaks of the work or the sale, a site that does not, of the lines.
 * @param {string} kind - "service", "product" (see `kindOfLines`)
 * @param {boolean} every - every line names its person (false: only some do)
 * @param {boolean} [told] - whether the site tells the kinds (default: it is read from the kinds loaded)
 */
export function whoKeepsLabel(kind, every, told = siteTellsTheKinds()) {
	if (!told) {
		return every
			? __("Every line keeps its sales person.")
			: __("The lines that have a sales person keep it.")
	}
	return kind === PRODUCT
		? __("The items keep the person who sold them.")
		: __("The services keep the person who did them.")
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
 * @param {string} [question] - the question the till's manager chose for a service, in the client's words (default: the one loaded); it is asked of a
 *   service, and of a line whose kind is not known, never of a product
 */
export function whoLabel(kind, told = siteTellsTheKinds(), question = siteQuestion()) {
	if (question && kind !== PRODUCT) return question
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

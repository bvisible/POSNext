//// Neoffice — added file (no upstream equivalent). The cart of a table's order, grouped by course like the kitchen's ticket (NeoResto lot 1, Daniel, 01.11: « il faut la même
//// logique que dans la cuisine sur le ticket de la table, il faut barrer et réduire pour laisser que ce qu'il reste visible, ce sera plus pratique visuellement »).
////
//// The lines are drawn under a header per course, in the order of the meal (Drink, Starter, Main, Dessert). A line with no family stays after them, under no header. A course
//// whose lines are ALL delivered FOLDS into one header row (its name, how many lines, what they come to) that a press opens again: what is done is out of the way and what
//// remains is what the eye finds. The lines held back by the waiter (`Waiting`) are no part of any course yet: they form a group of their own, the last one, right above the
//// buttons that order them. Nothing here changes the bill: a delivered line is still billed, folded or not.
////
//// The rule is PURE: the rows of the cart in, the groups to draw out. The rows come back as they went in (same objects: the cart acts on them), and a row that hangs under
//// another (a gift, an offered row) follows it into its group.

import { SERVICE_FAMILIES, familyOf } from "@/utils/serviceFamilies"
import { sectionLabel } from "@/utils/ticketFamilies"

/** The key of the group of the lines held back. */
export const HELD_KEY = "held"
/** The key of the group of the lines that are no course. */
export const LOOSE_KEY = "loose"

const HELD = "Waiting"
const DELIVERED = "Delivered"

/** Whether the kitchen has delivered the line. */
export function isDeliveredLine(line) {
	return line?.kds_status === DELIVERED
}

const isHeldLine = (line) => line?.kds_status === HELD

// A gift or an offered row hangs under the line that earned it (see nestFreeRows, nestOfferedRows)
const hangsUnder = (line) => Boolean(line?._giftOf || line?._offeredOf)

// The place of a line's family in the meal; a line with none comes after every course
const rankOf = (line) => {
	const rank = SERVICE_FAMILIES.indexOf(familyOf(line))
	return rank < 0 ? SERVICE_FAMILIES.length : rank
}

// What the line comes to: its amount when it has one (a discount included, 0 for a free line), else its rate for its quantity
function defaultAmountOf(line) {
	const amount = line?.amount
	if (amount !== null && amount !== undefined && amount !== "") {
		return Number.parseFloat(amount) || 0
	}
	return (Number.parseFloat(line?.rate) || 0) * (Number.parseFloat(line?.quantity) || 0)
}

// A line and the rows that hang under it, in order. A row that hangs under nothing stands on its own.
function unitsOf(rows) {
	const units = []
	for (const row of rows || []) {
		if (hangsUnder(row) && units.length) units[units.length - 1].push(row)
		else units.push([row])
	}
	return units
}

function makeGroup({ key, kind, family, units, amountOf, expanded }) {
	const rows = units.flat()
	// Only a course has a header to fold under: the lines of no course, and the lines held back, are drawn as they are
	const delivered = kind === "course" && units.every((unit) => isDeliveredLine(unit[0]))
	const folded = delivered && !expanded.has(key)
	return {
		key,
		kind,
		family,
		rows,
		// the lines of the group: a row that hangs under another is part of it
		count: units.length,
		subtotal: rows.reduce((sum, row) => sum + amountOf(row), 0),
		delivered,
		folded,
		visibleRows: folded ? [] : rows,
	}
}

/**
 * The groups to draw, in order: one per course that has a line (the order of the meal), then the lines that are no course (no header), then the lines held back.
 *
 * @param {Array<Object>} rows - The rows the cart shows, in order (`service_family`, `kds_status`, `amount` or `rate` and `quantity`)
 * @param {Object} [options]
 * @param {(row: Object) => number} [options.amountOf] - What a row comes to (the cart's own way of reading it); by default its amount, else its rate for its quantity
 * @param {Set<string>} [options.expanded] - The keys of the folded courses a waiter opened again
 * @returns {Array<{ key: string, kind: "course"|"loose"|"held", family: string, rows: Object[], count: number, subtotal: number, delivered: boolean, folded: boolean, visibleRows: Object[] }>}
 */
export function groupCartByCourse(rows, { amountOf = defaultAmountOf, expanded = new Set() } = {}) {
	const courses = new Map(SERVICE_FAMILIES.map((family) => [family, []]))
	const loose = []
	const held = []
	for (const unit of unitsOf(rows)) {
		const lead = unit[0]
		if (isHeldLine(lead)) held.push(unit)
		else if (familyOf(lead)) courses.get(familyOf(lead)).push(unit)
		else loose.push(unit)
	}
	// The held lines come in the order of the meal: the course to order next is the first one (a stable sort keeps the order of lines of a course)
	held.sort((a, b) => rankOf(a[0]) - rankOf(b[0]))

	const groups = []
	for (const [family, units] of courses) {
		if (units.length) groups.push(makeGroup({ key: family, kind: "course", family, units, amountOf, expanded }))
	}
	if (loose.length) groups.push(makeGroup({ key: LOOSE_KEY, kind: "loose", family: "", units: loose, amountOf, expanded }))
	if (held.length) groups.push(makeGroup({ key: HELD_KEY, kind: "held", family: "", units: held, amountOf, expanded }))
	return groups
}

/**
 * The keys of the opened folds after a press on one: a new set, the one given is left alone.
 *
 * @param {Set<string>} expanded
 * @param {string} key
 * @returns {Set<string>}
 */
export function toggleKey(expanded, key) {
	const next = new Set(expanded)
	if (next.has(key)) next.delete(key)
	else next.add(key)
	return next
}

/**
 * The words on the header of a group: a course by its name, the lines held back as the kitchen's ticket calls them, "" for the lines that are no course.
 *
 * @param {{ kind: string, family: string }} group
 * @returns {string}
 */
export function courseGroupLabel(group) {
	if (group?.kind === "held") return __("Coming Next")
	if (group?.kind === "course") return sectionLabel(group.family)
	return ""
}

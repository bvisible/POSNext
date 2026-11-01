//// Neoffice — added file (no upstream equivalent). The service families of a restaurant order, on the till's side
//// (NeoRestau lot 1). A restaurant says, on the Item Group of its menu, which group is a drink, a starter, a main or a
//// dessert; each line of an order carries its family (`service_family`), and a table's order goes to the kitchen in the
//// rhythm of a meal: the drinks and the first food family present at « Valider », the other food held back (`Waiting`)
//// until the waiter orders the next course.
////
//// THE RULE IS THE SERVER'S (pos_next/restaurant/service_families.py: plan_send, next_release, held_lines). This copy only
//// serves the kitchen dialog's pre-ticked boxes and the label of the « order the next course » button, which have to answer
//// at once and offline; the server decides what is really saved. Both are tested against ONE table of examples
//// (pos_next/tests/service_family_cases.json), so that the boxes the dialog ticks are the lines the server sends.
////
//// A line is `{ service_family, kds_status }`: the status is empty for a line not sent yet, "Waiting" for a line held back,
//// anything else for a line that has left for the kitchen.

import { computed, shallowRef } from "vue"
import { hasLeftForTheKitchen } from "./lineKitchenState"

export const SERVICE_FAMILIES = ["Drink", "Starter", "Main", "Dessert"]
// The food families, in the order a meal serves them
export const COURSES = ["Starter", "Main", "Dessert"]

const HELD = "Waiting"

// The family of every Item Group that has one, its own or the nearest up its tree, as the server resolved it
// (pos_next.api.service_families.get_group_families). The till reads it once with the rest of the restaurant and never
// walks the group tree itself. It lives here, not in the restaurant store, so that the cart can read it without
// instantiating the whole restaurant store.
const groupFamilies = shallowRef({})

/** Keeps the map of groups to families the server sent. */
export function setGroupFamilies(map) {
	groupFamilies.value = map && typeof map === "object" ? { ...map } : {}
}

/** The family of an Item Group, "" for a group with none (its articles are never held). */
export function familyOfGroup(group) {
	return (group && groupFamilies.value[group]) || ""
}

/** Whether the restaurant has set any family: no family anywhere, and the till shows nothing of them. */
export const hasServiceFamilies = computed(
	() => Object.keys(groupFamilies.value).length > 0,
)

/** The family of a line, "" for a line with none or one nobody knows. */
export function familyOf(line) {
	const family = String(line?.service_family || "").trim()
	return SERVICE_FAMILIES.includes(family) ? family : ""
}

/** The place of a food family in the meal (1, 2, 3); 0 for a drink or no family: they follow no course. */
function rankOf(family) {
	return COURSES.indexOf(family) + 1
}

const isNew = (line) => !line?.kds_status
const isHeld = (line) => line?.kds_status === HELD

/**
 * Whether an order is a table's service: it sits at a table and is no takeaway. The rest (counter, pager, takeaway) goes at
 * once, nothing is held.
 *
 * @param {{ restaurantTable?: any, isTakeaway?: boolean }} order
 * @returns {boolean}
 */
export function isTableService({ restaurantTable, isTakeaway } = {}) {
	return Boolean(restaurantTable) && !isTakeaway
}

/**
 * What a send does with each line: "send", "hold" (the line is, or goes, on hold) or "left" (it already left).
 *
 * - Outside a table's service every new line is sent.
 * - At a table, a new drink or a new line of no family is sent. A new food line is sent when its family has already left (it
 *   is never held behind a family that left) or, while no food has left yet, when it belongs to the first food family present
 *   among the new lines, unless a line of that family or an earlier one is held back already. Any other new food line is held:
 *   the meal has begun, and only the waiter's gesture orders the next course.
 * - A held line stays held: a plain send never releases one.
 *
 * @param {Array<Object>} lines - The order's lines, in order
 * @param {boolean} tableService
 * @param {string[]} [sentFamilies] - The families the stored order already sent
 * @returns {Array<"send"|"hold"|"left">} One decision per line
 */
export function planKitchenSend(lines, tableService, sentFamilies = []) {
	const all = lines || []
	const leftRank = Math.max(
		0,
		...sentFamilies.map((family) => rankOf(family)),
		...all.filter(hasLeftForTheKitchen).map((line) => rankOf(familyOf(line))),
	)
	const rankOfNew = all
		.filter((line) => isNew(line) && rankOf(familyOf(line)))
		.map((line) => rankOf(familyOf(line)))
	const rankOfHeld = all
		.filter((line) => isHeld(line) && rankOf(familyOf(line)))
		.map((line) => rankOf(familyOf(line)))
	const lead = rankOfNew.length ? Math.min(...rankOfNew) : 0
	const leadIsFree = !rankOfHeld.some((rank) => rank <= lead)

	return all.map((line) => {
		if (hasLeftForTheKitchen(line)) return "left"
		if (isHeld(line)) return "hold"
		if (!tableService) return "send"
		const rank = rankOf(familyOf(line))
		if (!rank) return "send"
		if (leftRank) return rank <= leftRank ? "send" : "hold"
		return rank === lead && leadIsFree ? "send" : "hold"
	})
}

/**
 * The indexes of every line on hold: what « order everything » sends.
 *
 * @param {Array<Object>} lines
 * @returns {number[]}
 */
export function heldLines(lines) {
	const held = []
	;(lines || []).forEach((line, index) => {
		if (isHeld(line)) held.push(index)
	})
	return held
}

/**
 * The next course among the held lines: its family and the indexes of its held lines. Only the food families are courses:
 * a held drink, or a held line of no family, is released by « order everything », by the kitchen dialog or by the quick send
 * of its own line. No course held: no family and no index.
 *
 * @param {Array<Object>} lines
 * @returns {{ family: string, indexes: number[] }}
 */
export function nextRelease(lines) {
	const courses = []
	;(lines || []).forEach((line, index) => {
		if (isHeld(line) && rankOf(familyOf(line))) {
			courses.push({ index, rank: rankOf(familyOf(line)) })
		}
	})
	if (!courses.length) return { family: "", indexes: [] }
	const first = Math.min(...courses.map((course) => course.rank))
	return {
		family: COURSES[first - 1],
		indexes: courses
			.filter((course) => course.rank === first)
			.map((course) => course.index),
	}
}

/**
 * Whether the waiter may give the line another family: a line not sent yet, or held back. A line the kitchen has keeps the
 * family it was ordered under.
 *
 * @param {Object} line
 * @returns {boolean}
 */
export function canChangeFamily(line) {
	return !hasLeftForTheKitchen(line)
}

/**
 * The label of a family, in the user's language: what a chip or a choice says. One literal `__()` per word: the catalogue
 * extraction reads the msgid and its context from the source, it cannot follow a variable. The words are common ones
 * ("Main", "Drink") that another app of the site translates for its own sense, and the app loaded last wins Frappe's merged
 * dictionary: the context keeps the restaurant's sense apart.
 *
 * @param {string} family
 * @returns {string} "" for no family
 */
export function familyLabel(family) {
	switch (family) {
		case "Drink":
			return __("Drink", null, "Service family")
		case "Starter":
			return __("Starter", null, "Service family")
		case "Main":
			return __("Main", null, "Service family")
		case "Dessert":
			return __("Dessert", null, "Service family")
		default:
			return ""
	}
}

/** The course a button names, with its article: « les plats ». One literal `__()` per word, see familyLabel. */
function courseWithArticle(family) {
	switch (family) {
		case "Starter":
			return __("the starters", null, "Service family")
		case "Main":
			return __("the mains", null, "Service family")
		case "Dessert":
			return __("the desserts", null, "Service family")
		default:
			return ""
	}
}

/**
 * The label of the button that orders the next course, naming it: « Commander la suite · les plats ».
 *
 * @param {string} family - The next course (see nextRelease), "" when it is not known
 * @returns {string}
 */
export function nextCourseLabel(family) {
	const course = courseWithArticle(family)
	return course
		? __("Order the next course · {0}", [course], "Service family")
		: __("Order the next course", null, "Service family")
}

/** The label of the second action: everything held goes at once, for a table in a hurry. */
export function orderEverythingLabel() {
	return __("Order everything", null, "Service family")
}

/** The short help under the choice of a family: a starter served with the mains is a starter given the family Main. */
export function servedWithTheMainsHint() {
	return __(
		"To serve a starter with the mains, choose Main.",
		null,
		"Service family",
	)
}

/** The name of the choice of a family: « Service ». The label of the field in the line's edit dialogs, and the name of the chip's menu. */
export function serviceLabel() {
	return __("Service", null, "Service family")
}

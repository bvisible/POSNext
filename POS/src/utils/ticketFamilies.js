//// Neoffice — added file (no upstream equivalent). The sections of a kitchen or runner ticket by service family, and the pale tint of a
//// category (NeoRestau lot 1, Daniel's request of 01.11: « comment on fait pour séparer entrée, plat, dessert » on the tickets, « une section
//// avec un petit liséré, un tiret qui montre la séparation », and « une couleur très pastel mais parlante, configurable dans les catégories,
//// pas obligatoire, une couleur de fond pour les catégories »).
////
//// The dishes of a ticket still to cook are drawn in SECTIONS, in the order of the meal (Drink, Starter, Main, Dessert), each under a thin
//// dashed rule with a small label at its left. A dish whose family is unknown (a group with none anywhere up its tree, an old line) stands
//// LOOSE at the top of the send, under no label, as every dish did before the sections. A ticket none of whose dishes carries a family is
//// therefore ONE loose section, drawn exactly as it always was. The dishes already delivered (struck through) stay at the end of their send,
//// under no label.
////
//// A category may carry a colour (`service_color` on the Item Group, optional, set at the desk). The server sends it on every dish of the
//// category (`service_color`, always `#RRGGBB` or empty) and the card tints the dish's row with a very pale shade of it. The value is user data
//// and ends up in a style, so it is checked HERE too before it is used, whatever the server did: a value that is not a strict `#RRGGBB`
//// is no colour at all.

import { SERVICE_FAMILIES, familyOf } from "@/utils/serviceFamilies"

/** How much of the category's colour the tint holds: the colour at 16 % over the card, in light and in dark mode alike. */
export const TINT_ALPHA = 0.16

/** The class that paints a row with its tint: the variable is set on the row itself (`tintStyle`), so the pressed state of the row still wins over it. */
export const TINT_CLASS = "bg-[color:var(--service-tint)]"

const COLOR = /^#[0-9A-Fa-f]{6}$/

/** Whether a value is a colour that may be put in a style: a strict `#RRGGBB`, nothing else (no name, no short form, no function, no trailing text). */
export function isColor(value) {
	return typeof value === "string" && COLOR.test(value)
}

/** The tint of a category's colour: `rgba(r, g, b, 0.16)`, or "" for a colour that is no `#RRGGBB`. */
export function tintOf(color) {
	if (!isColor(color)) return ""
	const [r, g, b] = [1, 3, 5].map((start) =>
		Number.parseInt(color.slice(start, start + 2), 16),
	)
	return `rgba(${r}, ${g}, ${b}, ${TINT_ALPHA})`
}

/** The inline style that carries a row's tint (the variable `TINT_CLASS` reads), `undefined` for no colour or an invalid one. */
export function tintStyle(color) {
	const tint = tintOf(color)
	return tint ? { "--service-tint": tint } : undefined
}

/** The label of a section, in the words of the restaurant's language (the card writes it in capitals, small). */
export function sectionLabel(family) {
	switch (family) {
		case "Drink":
			return __("Drinks", null, "Service family")
		case "Starter":
			return __("Starters", null, "Service family")
		case "Main":
			return __("Mains", null, "Service family")
		case "Dessert":
			return __("Desserts", null, "Service family")
		default:
			return ""
	}
}

/**
 * The dishes given, cut into sections by family in the order of the meal.
 *
 * The dishes of no (or an unknown) family come first, in one section without a label; then one section per family that has dishes, with its
 * label. Inside a section the dishes keep the order they were given in.
 *
 * @param {Array<Object>} lines - Dishes with a `service_family` (the server's)
 * @returns {Array<{ family: string, label: string, items: Object[] }>}
 */
export function sectionsOf(lines) {
	const loose = []
	const byFamily = new Map(SERVICE_FAMILIES.map((family) => [family, []]))
	for (const line of lines || []) {
		const family = familyOf(line)
		if (family) byFamily.get(family).push(line)
		else loose.push(line)
	}
	const sections = []
	if (loose.length) sections.push({ family: "", label: "", items: loose })
	for (const [family, items] of byFamily)
		if (items.length)
			sections.push({ family, label: sectionLabel(family), items })
	return sections
}

/**
 * The dishes in the order they are drawn in, each one saying what the card needs to draw it.
 *
 * - `_head`: `{ family, label }` on the FIRST dish of a section that has a label (the card draws the label and its rule above that dish, inside the dish's own
 *   wrapper, so that in the full-screen columns a label is never left alone at the foot of a column), `null` on every other dish;
 * - `_rule`: whether a faint rule is drawn above the dish, as it always was between two dishes: every dish but the first of the list, and but the first of a
 *   section that has a label (its label is the divider).
 *
 * `tail` are dishes drawn after the sections under no label (the ones already delivered). The dishes are copied, never changed.
 *
 * @param {Array<Object>} lines - The dishes to put in sections
 * @param {Array<Object>} [tail] - Dishes drawn last, under no label
 * @returns {Array<Object>} The copies, in drawing order
 */
export function inSections(lines, tail = []) {
	const out = []
	for (const section of sectionsOf(lines)) {
		section.items.forEach((line, index) => {
			const headed = index === 0 && Boolean(section.label)
			out.push({
				...line,
				_head: headed ? { family: section.family, label: section.label } : null,
				_rule: out.length > 0 && !headed,
			})
		})
	}
	for (const line of tail || [])
		out.push({ ...line, _head: null, _rule: out.length > 0 })
	return out
}

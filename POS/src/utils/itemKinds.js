//// Neoffice — added file (no upstream equivalent). What each line of the cart is, a service or a product (NeoSalon, lot G1, product owner, 09.11.2026).
//// The till does not know it: the site says it through the hook `pos_next_item_kind`, and `pos_next.sales_person_lines.item_kinds` hands the answer for the items
//// asked. A salon's cashier reads « Who did the work? » on a service and « Who sold it? » on a product, and a product asks for its person only if the till follows
//// the sales of products by person too. A site without the hook tells nothing (`told` stays false): every line is a service and the words stay « Sales Person ».
import { reactive } from "vue"
import { call } from "@/utils/apiWrapper"

export const SERVICE = "service"
export const PRODUCT = "product"

// item_code -> "service" | "product" | "" (the site has no answer); reactive, so that a line shows the right words as soon as they are known
const kinds = reactive({})
const asked = new Set()
const site = reactive({ told: false, known: false })
// A first ask is on its way (or answered): a second one with no item to ask for would only repeat it
let siteAsked = false

/** @returns "service", "product", "" (no answer) or undefined (not asked yet) */
export function kindOf(itemCode) {
	return itemCode ? kinds[itemCode] : undefined
}

/** Whether the site tells services from products at all (it has the hook): else the till keeps its ordinary words. */
export function siteTellsTheKinds() {
	return site.told
}

/**
 * Ask for the kinds of items not asked yet; nothing is asked twice, and a failed or offline ask is forgotten so that the next one tries again.
 * @param {string} posProfile
 * @param {string[]} itemCodes
 */
export async function loadItemKinds(posProfile, itemCodes = []) {
	if (!posProfile) return
	const wanted = [...new Set(itemCodes)].filter(
		(code) => code && !(code in kinds) && !asked.has(code),
	)
	// The first ask of a session goes even with nothing to ask for: it tells whether the site has the hook
	if (!wanted.length && siteAsked) return
	siteAsked = true
	wanted.forEach((code) => asked.add(code))
	try {
		const answer = await call("pos_next.sales_person_lines.item_kinds", {
			pos_profile: posProfile,
			item_codes: wanted,
		})
		const body = answer?.message || answer || {}
		site.told = Boolean(body.told)
		site.known = true
		Object.assign(kinds, body.kinds || {})
	} catch (error) {
		wanted.forEach((code) => asked.delete(code))
		siteAsked = site.known
		console.error("Failed to load the kind of the items:", error)
	}
}

/** Forget everything (a sign-out, a change of till, a test). */
export function forgetItemKinds() {
	for (const code of Object.keys(kinds)) delete kinds[code]
	asked.clear()
	site.told = false
	site.known = false
	siteAsked = false
}

//// Neoffice — added file (no upstream equivalent): what the till's customer form asks before it creates a customer
//// (neoffice-maintenance#1109, #1120), the same two questions as the desk's creation window (neoffice_theme,
//// neoGuardCustomerDuplicateAndAddress). Daniel, 03.10: duplicates « arrivent assez régulièrement », and « on ne peut
//// rien faire sans adresse ». Both are warnings, never a refusal: the cashier may create anyway, or take the customer
//// who already exists for the sale. The customers are found by neoffice_theme.events.find_existing_customers, with the
//// cashier's own rights; when the till cannot ask (offline, a refusal), nothing is asked. Kept apart from the form so
//// that its rules are tested without mounting it (__tests__/customerCreationWarnings.spec.js).

/** What a name is for the questions already answered: one question per name, whatever its case and spaces. */
export function creationKey(name) {
	return String(name || "")
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.join(" ")
}

/**
 * The question to ask before creating, or null to create.
 * @param {object} state
 * @param {Array} state.matches the customers found for the name
 * @param {string} state.key creationKey of the name being created
 * @param {string|null} state.createAnywayFor the key the cashier chose to create anyway
 * @param {boolean} state.addressShown whether the form shows the address (a setting of the till)
 * @param {boolean} state.addressGiven whether a street was typed
 * @param {boolean} state.withoutAddress whether the cashier chose to create without an address
 * @returns {{kind: "duplicate", matches: Array}|{kind: "address"}|null}
 */
export function nextCreationQuestion({ matches = [], key, createAnywayFor = null, addressShown, addressGiven, withoutAddress }) {
	if (matches.length && createAnywayFor !== key) return { kind: "duplicate", matches }
	// A till that does not show the address takes none: nothing to ask there.
	if (addressShown && !addressGiven && !withoutAddress) return { kind: "address" }
	return null
}

/** Why a customer found is named, in the cashier's words (`translate` is the till's __). */
export function matchReason(match, translate) {
	const why =
		match.why === "tax_id"
			? translate("same company number {0}", [match.tax_id])
			: match.why === "both"
				? translate("same name and same company number")
				: translate("same name")
	return match.disabled ? `${why} · ${translate("disabled")}` : why
}

/** The sentence of the duplicate question: a company number already taken is most likely the same company. */
export function duplicateSentence(matches, translate) {
	return (matches || []).some((m) => m.why !== "name")
		? translate("A customer with this company number already exists: it is most likely the same company.")
		: translate("A customer of this name already exists. A namesake is possible; otherwise take the existing customer.")
}

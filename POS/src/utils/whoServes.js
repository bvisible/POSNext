//// Neoffice — added file (no upstream equivalent). « Who serves? » at the head of the cart (NeoSalon, lot G1, product owner, 09.11.2026): the person a new line is given.
//// Product owner: « if I open the till with an employee account, the person is already chosen: Luc is Luc, but I can put Sonia ». The server marks the sales person whose
//// Employee is the signed-in user (`is_mine`). On a shared till (the reception's account, no employee) nobody is the cashier's own: the cashier picks who serves, and the choice
//// is remembered for the session of the screen so that it is not asked for each sale. The rules are here, apart from the store and the component, to be read and tested alone.

const KEY_PREFIX = "pos_next_who_serves:"

/**
 * Who a new sale starts with: the cashier's own sales person if the account has one, else the one chosen before on this shared till.
 * @param {{ persons: Array, remembered: string|null }} state - the till's sales persons and the name remembered for it
 * @returns {object|null} the row of the list to choose, or null (nobody is chosen)
 */
export function pickWhoServes({ persons, remembered }) {
	const list = persons || []
	const mine = list.find((person) => person?.is_mine)
	if (mine) return mine
	if (remembered)
		return list.find((person) => person?.name === remembered) || null
	return null
}

/** Whether the list has a person who is the cashier's own: if so, the account is a person's, not a shared till's, and nothing is remembered. */
export function hasOwnPerson(persons) {
	return (persons || []).some((person) => person?.is_mine)
}

function storage() {
	try {
		return typeof sessionStorage === "undefined" ? null : sessionStorage
	} catch {
		return null
	}
}

/** The person remembered for this till on this screen's session (a name of Sales Person), or null. */
export function rememberedWhoServes(posProfile) {
	if (!posProfile) return null
	try {
		return storage()?.getItem(KEY_PREFIX + posProfile) || null
	} catch {
		return null
	}
}

export function rememberWhoServes(posProfile, name) {
	if (!posProfile) return
	try {
		if (name) storage()?.setItem(KEY_PREFIX + posProfile, name)
		else storage()?.removeItem(KEY_PREFIX + posProfile)
	} catch {
		// private mode, storage full: the choice is just not remembered
	}
}

/** The shape a cart line and the payment take of a row of the list. */
export function asLinePerson(person) {
	return person
		? {
				sales_person: person.name,
				sales_person_name: person.sales_person_name || person.name,
			}
		: null
}

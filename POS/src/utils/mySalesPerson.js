//// Neoffice — added file (no upstream equivalent). The sales person a sale starts with (NeoCoiffeur study, 09.11.2026; product
//// owner: « if I open the till with an employee account, the person is already chosen: Luc is Luc, but I can put Sonia »).
//// The server marks the sales person whose Employee is the signed-in user (`is_mine`, `get_sales_persons`). The payment dialog
//// is too large to mount in a test, so its rule lives here: nothing is chosen when the option is off, when a person is already
//// chosen (the cashier's own choice is never replaced), or when no row is the cashier's (a front desk account has no sales person).

/**
 * @param {string} [preferred] - the name of the sales person chosen in « Who did the work? » above the cart: it comes before the cashier's own
 * @returns the row to choose, or null.
 */
export function mySalesPerson({ enabled, selected, persons, preferred }) {
	if (!enabled) return null;
	if (selected && selected.length > 0) return null;
	if (preferred) {
		const chosen = (persons || []).find((person) => person?.name === preferred);
		if (chosen) return chosen;
	}
	return (persons || []).find((person) => person?.is_mine) || null;
}

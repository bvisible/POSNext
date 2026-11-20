//// Neoffice — added file (no upstream equivalent). Which group a new customer of the till starts in (neoffice-maintenance#3108).
//// The group carries price lists and pricing rules: a customer filed in a group the cashier did not choose pays another price. The form used to fall back on the FIRST group
//// of the list (alphabetical) when none of the names it guessed existed, so a salon customer could be filed among the resellers. The group is now the one of the type (a site
//// that names « Individuel » / « Commercial »), else the one the site says (the till's profile or the selling settings), else NONE: the cashier chooses.

/**
 * The group the form starts in.
 * @param {{ type: string, groups: string[], siteDefault: string }} form - the type of the customer (« Individual » or « Company »), the groups the cashier can choose from, the group the site says
 * @returns {string} a group of the list, or "" (nothing is taken at random)
 */
export function preferredCustomerGroup({ type, groups, siteDefault }) {
	const list = groups || []
	const named = type === "Company" ? "Commercial" : "Individuel"
	if (list.includes(named)) return named
	if (siteDefault && list.includes(siteDefault)) return siteDefault
	return ""
}

/** Whether the cashier still has to choose a group: there is a choice and none was made. Without a list (it could not be read) the server applies the site's default itself. */
export function customerGroupIsMissing({ groups, chosen }) {
	return (groups || []).length > 0 && !chosen
}

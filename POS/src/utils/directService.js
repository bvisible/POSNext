//// Neoffice — added file (no upstream equivalent). A table of direct service: a bar, a counter, a window where the ticket is typed and paid in one go (the product owner, 08.11.2026:
//// « un bar, une table, un comptoir doit pouvoir encaisser sans la gestion de table […] à la fin de la transaction on revient directement sur cette table pour taper le ticket suivant »).
//// It is a table of the floor like any other, never seated or cleaned (the server keeps its status), and the till comes back to it with an empty ticket once a ticket is paid.

/** Whether a table is a table of direct service. */
export const isDirectService = (table) => Boolean(table?.direct_service)

/**
 * The table of direct service a till is set to open on (its `default_restaurant_table`), as the floor holds it: none when the till names none, or names a
 * table the floor does not know (deleted) or that is no longer a table of direct service (the option was taken off).
 *
 * @param {Array<Object>} tables - The floor's tables, as the till holds them
 * @param {string} [name] - The name of the till's default table ("" for a till that has none, such as a waiter's pad)
 * @returns {Object|null}
 */
export function defaultTableOf(tables, name) {
	if (!name) return null
	const table = (tables || []).find((candidate) => candidate.name === name)
	return isDirectService(table) ? table : null
}

/**
 * Opens the table the till comes back to once a ticket is paid, to type the next ticket: the till's own default table when it has one (the bar's till comes back to
 * the counter whichever table the ticket was paid at), else the table of direct service the ticket was paid at, in its fresh version from the floor's list when
 * the list has it, else the one the ticket was paid at. Nothing is opened for any other table.
 *
 * @param {Object|null} table - The table the ticket was paid at
 * @param {Array<Object>} tables - The floor's tables, as the till holds them
 * @param {(table: Object) => Promise<boolean>} open - The till's way to open a table (composables/useOpenTable)
 * @param {string} [defaultTable] - The name of the till's default table, when it has one
 * @returns {Promise<boolean>} Whether a table was opened again
 */
export async function reopenDirectTable(table, tables, open, defaultTable = "") {
	const own = defaultTableOf(tables, defaultTable)
	if (own) return Boolean(await open(own))
	if (!isDirectService(table)) return false
	const fresh = (tables || []).find((candidate) => candidate.name === table.name) || table
	return Boolean(await open(fresh))
}

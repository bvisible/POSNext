//// Neoffice — added file (no upstream equivalent). A table of direct service: a bar, a counter, a window where the ticket is typed and paid in one go (the product owner, 08.11.2026:
//// « un bar, une table, un comptoir doit pouvoir encaisser sans la gestion de table […] à la fin de la transaction on revient directement sur cette table pour taper le ticket suivant »).
//// It is a table of the floor like any other, never seated or cleaned (the server keeps its status), and the till comes back to it with an empty ticket once a ticket is paid.

/** Whether a table is a table of direct service. */
export const isDirectService = (table) => Boolean(table?.direct_service)

/**
 * Opens the table of direct service a ticket was just paid at, to type the next ticket: its fresh version from the floor's list when the list has it, else the one the ticket was
 * paid at. Nothing is opened for any other table.
 *
 * @param {Object|null} table - The table the ticket was paid at
 * @param {Array<Object>} tables - The floor's tables, as the till holds them
 * @param {(table: Object) => Promise<boolean>} open - The till's way to open a table (composables/useOpenTable)
 * @returns {Promise<boolean>} Whether the table was opened again
 */
export async function reopenDirectTable(table, tables, open) {
	if (!isDirectService(table)) return false
	const fresh = (tables || []).find((candidate) => candidate.name === table.name) || table
	return Boolean(await open(fresh))
}

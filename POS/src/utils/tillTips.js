//// Neoffice — added file (no upstream equivalent). Which tip settings a payment dialog follows (tips at a shop till, NeoCoiffeur
//// study, product owner, 09.11.2026: « les pourboires, comme dans le restaurant »). A restaurant till follows its restaurant's tip
//// settings, as it always did; a shop till follows its own (POS Settings). The server picks the same way for the same till
//// (`pos_next.api.invoices._tip_settings_of`), so the dialog never offers a tip the server would drop. The dialog is too large
//// to mount in a test, so the rule lives here.

/** @returns {{available: boolean, autoDetect: boolean}} whether the change can become a tip, and whether it does by itself. */
export function tipRules({
	restaurantMode,
	restaurantTips,
	restaurantAutoDetect,
	tillTips,
	tillAutoDetect,
}) {
	if (restaurantMode) {
		return { available: Boolean(restaurantTips), autoDetect: Boolean(restaurantAutoDetect) };
	}
	return { available: Boolean(tillTips), autoDetect: Boolean(tillTips && tillAutoDetect) };
}

//// Neoffice — added file (no upstream equivalent). Opening a screen of the restaurant (the runner, a kitchen screen) from the till (NeoResto lot 1, kitchen test of 01.11).
//// On a desktop or a tablet it opens in a tab of its own, as it always did. On a PHONE it opens in the same tab: a second tab left the waiter on a screen whose back arrow
//// leads to a copy of the till in that tab, with no way back to the tab he came from. In the same tab the arrow of the screen is the way back to the till.

/**
 * @param {string} url - The screen's address, with the till's restaurant in its query
 * @param {{ samePage?: boolean }} [options] - Open in this tab (a phone) instead of a new one
 */
export function openScreen(url, { samePage = false } = {}) {
	if (samePage) {
		window.location.assign(url)
		return
	}
	window.open(url, "_blank")
}

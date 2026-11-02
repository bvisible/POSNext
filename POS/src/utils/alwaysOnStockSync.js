//// Neoffice — added file (no upstream equivalent). The background refresh of the stock quantities is always on, every
//// minute, with no switch and no interval to set (NeoResto lot 1, task 13, ruling 84): upstream let a till switch it
//// off, which left the quantities on screen as old as the last sale of that till, and a till that never found the
//// switch never refreshed at all. The screen of the till's settings only shows its state.

// The time between two refreshes of the quantities of the items the till shows
export const STOCK_SYNC_INTERVAL_MS = 60000

// The key an older till wrote to switch the refresh off or to time it (`{ enabled, intervalSeconds }`): never read
// again, and removed so that a device that kept `{ enabled: false }` switches to always on
export const OLD_STOCK_SYNC_SETTING_KEY = "pos_stock_sync_settings"

export function forgetTheOldStockSyncSetting() {
	try {
		localStorage.removeItem(OLD_STOCK_SYNC_SETTING_KEY)
	} catch {
		// The browser's storage can be unavailable: nothing is read from it anyway
	}
}

/**
 * Configures the worker's stock refresh for these items and starts it, at the fixed interval.
 * @param worker - the offline worker client (`configureStockSync`, `startStockSync`)
 * @param {{ warehouse: string, itemCodes: string[] }} what - the warehouse and the item codes to follow
 */
export async function startAlwaysOnStockSync(worker, { warehouse, itemCodes }) {
	forgetTheOldStockSyncSetting()
	const config = await worker.configureStockSync({ warehouse, itemCodes, intervalMs: STOCK_SYNC_INTERVAL_MS })
	const result = await worker.startStockSync()
	return { config, result }
}

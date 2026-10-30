//// Neoffice — added file (no upstream equivalent). The kitchen screen lays its two bands out in one of two ways (NeoRestau
//// lot 1, task 23): BANDS, the waiting tickets in a lane above the tickets in preparation, each lane scrolling sideways;
//// or COLUMNS, the waiting tickets in a narrow column on the left and the tickets in preparation in a wide one on the
//// right, each scrolling up and down. Which one reads better depends on the tablet and on how it is held, so the cook
//// chooses, once per device; this file holds the rules of that choice and nothing of the drawing.

export const LAYOUT_BANDS = "bands"
export const LAYOUT_COLUMNS = "columns"
export const LAYOUTS = [LAYOUT_BANDS, LAYOUT_COLUMNS]

// Beside the other settings of this screen (pos_kds_area, pos_kds_show_delivered)
export const LAYOUT_STORAGE_KEY = "pos_kds_layout"

// What a device that has never been asked opens on, by the way it is held. Measured with 30 tickets waiting, 15 in preparation
// and one ticket of 25 dishes (report of task 23): side by side shows the dishes of a ticket whole where the bands clip them
// (5 dishes of the long ticket against 1 or 2 on a 1280 x 800 tablet, 11 against 4 on an 800 x 1280 one), and more tickets
// complete (3 + 2 against 2 + 2 held upright). So both orientations open on the columns. It is a table so that the day a
// real tablet says otherwise for one of them, that one value is the thing to change; it is not a setting.
export const DEFAULT_LAYOUTS = {
	landscape: LAYOUT_COLUMNS,
	portrait: LAYOUT_COLUMNS,
}

/**
 * The browser's storage, or null when the window refuses it. Even reading the property can throw (a sandboxed frame, site
 * data blocked), so it is never touched outside a try.
 */
function browserStorage() {
	try {
		return window.localStorage || null
	} catch {
		return null
	}
}

/**
 * The layout kept on this device.
 *
 * @param {Storage|null} [storage] - Where to look, the browser's by default
 * @returns {"bands"|"columns"|null} null when nothing is kept, or something that is not a layout of ours, or when the
 *   storage refuses: the screen then opens on its default
 */
export function readLayout(storage = browserStorage()) {
	try {
		const value = storage?.getItem(LAYOUT_STORAGE_KEY)
		return LAYOUTS.includes(value) ? value : null
	} catch {
		return null
	}
}

/**
 * Keeps a layout on this device.
 *
 * @param {string} layout
 * @param {Storage|null} [storage]
 * @returns {boolean} false when it is not a layout or could not be kept; the screen shows the choice all the same, for
 *   as long as it is open
 */
export function saveLayout(layout, storage = browserStorage()) {
	if (!LAYOUTS.includes(layout)) return false
	try {
		if (!storage) return false
		storage.setItem(LAYOUT_STORAGE_KEY, layout)
		return true
	} catch {
		return false
	}
}

/**
 * The layout of a device nobody has chosen for yet, by the way it is held.
 *
 * @param {{ portrait: boolean }} orientation
 * @param {{ landscape: string, portrait: string }} [table] - Which layout each orientation opens on
 */
export function defaultLayout({ portrait }, table = DEFAULT_LAYOUTS) {
	return portrait ? table.portrait : table.landscape
}

/**
 * The layout to draw.
 *
 * The cook's pick wins, wherever the tablet is turned. Until he has picked, the layout follows the orientation, and is
 * never written down: a tablet that is turned goes with it. Side by side needs room for two ticket columns, so a screen
 * narrower than that is always stacked, a pick or not.
 *
 * @param {{ stored: string|null, portrait: boolean, wide: boolean }} state
 * @param {{ landscape: string, portrait: string }} [table]
 * @returns {"bands"|"columns"}
 */
export function resolveLayout(
	{ stored, portrait, wide },
	table = DEFAULT_LAYOUTS,
) {
	if (!wide) return LAYOUT_BANDS
	return LAYOUTS.includes(stored) ? stored : defaultLayout({ portrait }, table)
}

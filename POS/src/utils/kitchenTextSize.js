//// Neoffice — added file (no upstream equivalent). The size of the text of the kitchen screen (NeoRestau lot 1, task 38a-1, ruling 109).
//// The product owner fights for room on the screen, and some cooks need glasses: the choice is theirs, one tap, kept on the device. The
//// screen ships DENSE (Compact): four tickets on a 1366 x 768 screen was too few, and a cook who needs bigger text asks for it.
////
//// A size is a table of CSS variables set on the page's root (the font sizes, the paddings of a dish, the height of the buttons); the card
//// and its parts read them with a fallback that is Compact, so that a card drawn outside the page is dense too. The values are the scale of
//// the mockup that was approved (task 38): Compact 13 px dishes, Normal 15, Large 18, Extra large 22. The WIDTH of a ticket is a size's too since
//// task 38a-2 (`--kds-card-w`: 250, 280, 330, 390 px): a dense ticket is a narrow one, and more of them fit across the screen; the grids and lanes of
//// utils/ticketLayout are as wide as this variable says, on the kitchen screen and on the runner's.

export const TEXT_SIZES = ["compact", "normal", "large", "xl"]
export const DEFAULT_TEXT_SIZE = "compact"

// Beside the other settings of this screen (pos_kds_area, pos_kds_layout, pos_kds_show_delivered)
export const TEXT_SIZE_STORAGE_KEY = "pos_kds_text_size"

//// Neoffice — the key under which the screen hands the size it shows to what stands below it (task 38a-3): a band that counts how many tickets fit a row needs it to measure
//// again when the size, so the width of a ticket, changes; a ticket opened full screen is drawn outside the screen's root, where the size's CSS variables do not reach, and needs it to
//// draw itself one step bigger. See useKitchenTextSize, which provides it.
export const TEXT_SIZE_KEY = Symbol("kitchen-text-size")

// What does not change with the size: the line height of a dish, and the padding of the head and of the dishes (the mockup's own: a dense ticket
// has 8 px at its sides whatever the text; the room a dish takes between two lines is the size's, `--kds-py`)
const COMMON = {
	"--kds-lh": "1.22",
	"--kds-pad-x": "8px",
	"--kds-head-py": "5px",
	"--kds-body-py": "0px",
}

//// Neoffice — the buttons are lower (kitchen test, 01.11): 36 / 38 / 40 / 46 px by size instead of 44 / 44 / 44 / 52, and 48 px in the panel instead of 56. The width is the card's; only the height was too much.
const TABLE = {
	compact: {
		"--kds-card-w": "250px",
		"--kds-fs": "13px",
		"--kds-fs-sub": "12px",
		"--kds-py": "3px",
		"--kds-fs-table": "15px",
		"--kds-fs-ref": "11px",
		"--kds-fs-num": "12px",
		"--kds-fs-timer": "13px",
		"--kds-fs-btn": "14px",
		"--kds-btn-h": "36px",
		"--kds-fs-tt": "10px",
		"--kds-tt-d": "none",
	},
	normal: {
		"--kds-card-w": "280px",
		"--kds-fs": "15px",
		"--kds-fs-sub": "15px",
		"--kds-py": "5px",
		"--kds-fs-table": "17px",
		"--kds-fs-ref": "12px",
		"--kds-fs-num": "13px",
		"--kds-fs-timer": "15px",
		"--kds-fs-btn": "15px",
		"--kds-btn-h": "38px",
		"--kds-fs-tt": "10px",
		"--kds-tt-d": "none",
	},
	large: {
		"--kds-card-w": "330px",
		"--kds-fs": "18px",
		"--kds-fs-sub": "18px",
		"--kds-py": "7px",
		"--kds-fs-table": "20px",
		"--kds-fs-ref": "14px",
		"--kds-fs-num": "15px",
		"--kds-fs-timer": "18px",
		"--kds-fs-btn": "17px",
		"--kds-btn-h": "40px",
		"--kds-fs-tt": "12px",
		"--kds-tt-d": "inline",
	},
	xl: {
		"--kds-card-w": "390px",
		"--kds-fs": "22px",
		"--kds-fs-sub": "22px",
		"--kds-py": "9px",
		"--kds-fs-table": "24px",
		"--kds-fs-ref": "16px",
		"--kds-fs-num": "17px",
		"--kds-fs-timer": "22px",
		"--kds-fs-btn": "19px",
		"--kds-btn-h": "46px",
		"--kds-fs-tt": "14px",
		"--kds-tt-d": "inline",
	},
}

/**
 * The size a ticket opened FULL SCREEN draws its dishes in (task 38a-3, ruling 107 layer 3): one step above the screen's, and never below Large, since a ticket is opened to be
 * read at a glance from where the cook stands. Extra large stays Extra large. A size nobody knows is the default's.
 *
 * @param {string} size - The size the screen shows
 * @returns {string} One of TEXT_SIZES
 */
export function fullScreenTextSize(size) {
	const known = TEXT_SIZES.indexOf(size)
	const from = known < 0 ? TEXT_SIZES.indexOf(DEFAULT_TEXT_SIZE) : known
	const floor = TEXT_SIZES.indexOf("large")
	return TEXT_SIZES[Math.min(Math.max(from + 1, floor), TEXT_SIZES.length - 1)]
}

// A head that is read from further away than a card's: the mockup's (task 38): the table at 34 px, the timer at 26 px, the number and the room's chip a little bigger,
// a main button 48 px high with 20 px words, and the paddings of a panel rather than a card. Each is a FLOOR: a size that is already bigger keeps its own.
const FULL_SCREEN_FLOORS = {
	"--kds-fs-table": 34,
	"--kds-fs-ref": 15,
	"--kds-fs-num": 17,
	"--kds-fs-timer": 26,
	"--kds-fs-tt": 15,
	"--kds-btn-h": 48,
	"--kds-fs-btn": 20,
}

/**
 * The CSS variables of a ticket opened full screen: the table of the size it is drawn in (fullScreenTextSize), with the head, the buttons and the paddings of a panel.
 * The panel is teleported out of the screen's root, where the screen's own variables do not reach, so it carries them itself.
 *
 * @param {string} size - The size the SCREEN shows (not the panel's: the step is taken here)
 * @returns {Record<string, string>}
 */
export function fullScreenVariables(size) {
	const variables = textSizeVariables(fullScreenTextSize(size))
	for (const [name, floor] of Object.entries(FULL_SCREEN_FLOORS))
		variables[name] = `${Math.max(Number.parseFloat(variables[name]), floor)}px`
	return {
		...variables,
		"--kds-pad-x": "16px",
		"--kds-head-py": "10px",
		"--kds-body-py": "4px",
		"--kds-tt-d": "inline",
	}
}

/**
 * The CSS variables of a size, to set on the screen's root.
 *
 * @param {string} size - One of TEXT_SIZES (anything else is the default)
 * @returns {Record<string, string>}
 */
export function textSizeVariables(size) {
	return { ...COMMON, ...(TABLE[size] || TABLE[DEFAULT_TEXT_SIZE]) }
}

/**
 * The size after this one in the cycle (Compact, Normal, Large, Extra large, Compact...). A size nobody knows leads to the one after the
 * default, so that the button always does something.
 *
 * @param {string} size
 * @returns {string}
 */
export function nextTextSize(size) {
	const known = TEXT_SIZES.indexOf(size)
	const from = known < 0 ? TEXT_SIZES.indexOf(DEFAULT_TEXT_SIZE) : known
	return TEXT_SIZES[(from + 1) % TEXT_SIZES.length]
}

/**
 * The browser's storage, or null when the window refuses it. Even reading the property can throw (a sandboxed frame, site data blocked), so
 * it is never touched outside a try.
 */
function browserStorage() {
	try {
		return window.localStorage || null
	} catch {
		return null
	}
}

/**
 * The size kept on this device.
 *
 * @param {Storage|null} [storage] - Where to look, the browser's by default
 * @returns {string} The size, or the default when nothing is kept, what is kept is not a size, or the storage refuses
 */
export function readTextSize(storage = browserStorage()) {
	try {
		const value = storage?.getItem(TEXT_SIZE_STORAGE_KEY)
		return TEXT_SIZES.includes(value) ? value : DEFAULT_TEXT_SIZE
	} catch {
		return DEFAULT_TEXT_SIZE
	}
}

/**
 * Keeps a size on this device.
 *
 * @param {string} size
 * @param {Storage|null} [storage]
 * @returns {boolean} false when it is not a size or could not be kept; the screen shows the choice all the same, for as long as it is open
 */
export function saveTextSize(size, storage = browserStorage()) {
	if (!TEXT_SIZES.includes(size)) return false
	try {
		if (!storage) return false
		storage.setItem(TEXT_SIZE_STORAGE_KEY, size)
		return true
	} catch {
		return false
	}
}

//// Neoffice — added file (no upstream equivalent). The settings of the PRINT BUTTON of the kitchen's and the runner's cards (NeoResto lot 1,
//// task 44): a big order is carried to the pass on paper, so a printer button stands beside the card's main button and prints a COPY of the ticket,
//// by the server, on the printer of the station the screen is opened on. Four settings, each with a sensible default, kept on THIS DEVICE like the
//// kitchen's text size and its awake settings (utils/screenAwake: the built-in default, the restaurant's value when it has one, then the device's):
////   - kitchen_print_button: the button on the kitchen screen (on; it is drawn where the station has a printer),
////   - runner_print_button: the button on the runner screen (off),
////   - print_scope: what prints, "station" (the lines of this station on the ticket) or "order" (the whole order),
////   - mark_copy: COPY and the time at the head of the paper, so that nobody cooks twice (on).
//// The button is HIDDEN where the station has no printer, whatever the settings say: the screen asks the server which stations have one.

export const PRINT_COPY_KEYS = [
	"kitchen_print_button",
	"runner_print_button",
	"print_scope",
	"mark_copy",
]

export const SCOPE_STATION = "station"
export const SCOPE_ORDER = "order"
export const SCOPES = [SCOPE_STATION, SCOPE_ORDER]

// The built-in defaults live here and nowhere else
export const PRINT_COPY_DEFAULTS = Object.freeze({
	kitchen_print_button: true,
	runner_print_button: false,
	print_scope: SCOPE_STATION,
	mark_copy: true,
})

// Beside the other settings of these screens (pos_kds_text_size, pos_screen_awake_*): one key per setting
export const PRINT_COPY_STORAGE_PREFIX = "pos_print_copy_"

// The screens, as the server names them (pos_next.restaurant.devices)
export const SCREEN_KITCHEN = "Kitchen"
export const SCREEN_RUNNER = "Runner"

const SWITCHES = new Set([
	"kitchen_print_button",
	"runner_print_button",
	"mark_copy",
])

/** The key of the setting that puts the button on a screen. */
export const buttonKey = (screen) =>
	screen === SCREEN_RUNNER ? "runner_print_button" : "kitchen_print_button"

/**
 * One value of one setting as the setting wants it, or undefined when it is not a value of it (so that the layer below stands).
 * A switch is true or false (a registry may spell it 1, 0, "1", "0", "true", "false"); the scope is one of SCOPES.
 */
function clean(key, value) {
	if (SWITCHES.has(key)) {
		if (value === true || value === 1 || value === "1" || value === "true")
			return true
		if (value === false || value === 0 || value === "0" || value === "false")
			return false
		return undefined
	}
	if (key === "print_scope") return SCOPES.includes(value) ? value : undefined
	return undefined
}

function cleanLayer(layer) {
	const kept = {}
	for (const key of PRINT_COPY_KEYS) {
		const value = clean(key, layer?.[key])
		if (value !== undefined) kept[key] = value
	}
	return kept
}

/** Whether a value is a value of a setting; the value as the setting keeps it, undefined when it is not one. */
export function cleanCopySetting(key, value) {
	return PRINT_COPY_KEYS.includes(key) ? clean(key, value) : undefined
}

/**
 * The settings a screen runs on: the built-in defaults, then the restaurant's values, then this device's.
 *
 * @param {{ restaurant?: object, device?: object }} layers
 */
export function resolveCopySettings({ restaurant, device } = {}) {
	return { ...PRINT_COPY_DEFAULTS, ...cleanLayer(restaurant), ...cleanLayer(device) }
}

/** The browser's storage, or null when the window refuses it (even reading the property can throw). */
function browserStorage() {
	try {
		return window.localStorage || null
	} catch {
		return null
	}
}

/** What this device kept: only the settings it holds a valid value for. */
export function readDeviceCopySettings(storage = browserStorage()) {
	const kept = {}
	if (!storage) return kept
	for (const key of PRINT_COPY_KEYS) {
		try {
			const value = clean(key, storage.getItem(PRINT_COPY_STORAGE_PREFIX + key))
			if (value !== undefined) kept[key] = value
		} catch {
			// A storage that refuses: the defaults stand
		}
	}
	return kept
}

/** Keeps one setting on this device; false when it is not a setting, not a value of it, or could not be kept. */
export function saveDeviceCopySetting(key, value, storage = browserStorage()) {
	const cleaned = cleanCopySetting(key, value)
	if (cleaned === undefined) return false
	try {
		if (!storage) return false
		storage.setItem(
			PRINT_COPY_STORAGE_PREFIX + key,
			SWITCHES.has(key) ? (cleaned ? "1" : "0") : String(cleaned),
		)
		return true
	} catch {
		return false
	}
}

// A dish waits for the kitchen's printer from the moment it is sent, and no longer once it is delivered (the server prints no other)
const NOT_AT_THE_KITCHEN = new Set(["", "Waiting", "Delivered"])

/** The stations of the dishes a ticket holds that are at the kitchen: the stations whose printer a copy may use. */
export function stationsAtTheKitchen(items) {
	const stations = new Set()
	for (const item of items || []) {
		if (item?.preparation_station && !NOT_AT_THE_KITCHEN.has(item.kds_status || ""))
			stations.add(item.preparation_station)
	}
	return [...stations]
}

/**
 * Whether the card of a ticket draws its print button.
 *
 * @param {object} what
 * @param {string} what.screen - SCREEN_KITCHEN or SCREEN_RUNNER
 * @param {object} what.settings - resolveCopySettings
 * @param {string[]} what.printerStations - the stations that have a printer (the server's answer)
 * @param {string[]} what.stations - the stations of the ticket's dishes (stationsAtTheKitchen)
 * @param {string|null} what.station - the station the screen is opened on, none for all of them
 * @param {string[]} what.withoutPrinter - the stations the server said, when asked to print, have none ("*": none at all)
 */
export function showsThePrintButton({
	screen,
	settings,
	printerStations = [],
	stations = [],
	station = null,
	withoutPrinter = [],
}) {
	if (!settings?.[buttonKey(screen)]) return false
	if (withoutPrinter.includes("*")) return false
	const printing = (name) =>
		printerStations.includes(name) && !withoutPrinter.includes(name)
	// Opened on a station: that station's printer. On all of them: the printer of any station the ticket has a dish for
	return station ? printing(station) : stations.some(printing)
}

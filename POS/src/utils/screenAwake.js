//// Neoffice — added file (no upstream equivalent). The settings of "keep the screen on" and "rest the screen" (NeoResto lot 1, task 47): the
//// product owner's tablet fell asleep by itself in the kitchen. Two different things are settled here, and told apart:
//// (1) KEEP THE SCREEN ON: the browser's Screen Wake Lock keeps the physical screen from going to sleep (useScreenAwake asks for it);
//// (2) REST: a web page cannot switch the physical screen off nor dim it, so after N minutes without a touch the page draws a near-black layer by
////     itself (ScreenRestLayer), while the lock and the live updates keep running.
////
//// THE DEFAULTS LIVE HERE AND NOWHERE ELSE, under the four keys below, so that the restaurant's own registry (the till's settings screen, not built
//// yet) can take them over: a setting is the built-in default, replaced by the restaurant's value when it has one (`restaurant`), replaced in turn by
//// what this DEVICE chose (`device`, kept in localStorage like the kitchen's text size). Nothing else in the front end holds a number of minutes.

// The five keys, as the registry will name them
export const SCREEN_AWAKE_KEYS = [
	"keep_screen_on",
	"rest_after_minutes",
	"wake_on_new_ticket",
	"release_wake_lock_after_minutes",
	//// Neoffice — how a screen at rest is drawn (Daniel, 01.11: the clock BIG, or the screen dark and a touch wakes it): the one setting here that is a word, not a switch or minutes
	"rest_style",
]

//// Neoffice — the two ways to draw a screen at rest: the big clock, or plain black (a web page cannot switch the display off; black is as dark as it gets, and nothing at all on an OLED panel)
export const REST_STYLES = ["clock", "black"]

// The built-in defaults. `keep_screen_on` is the default of an UNKNOWN screen; the screens that need the lock are in KEEP_SCREEN_ON_SCREENS.
export const SCREEN_AWAKE_DEFAULTS = Object.freeze({
	keep_screen_on: false,
	// 0 = never. A touch starts the count again.
	rest_after_minutes: 30,
	// A kitchen must never miss a ticket
	wake_on_new_ticket: true,
	// 0 = never: the lock is kept for as long as the page is open. N: that many minutes into a rest the lock is RELEASED, so that the tablet's own auto-lock takes over.
	release_wake_lock_after_minutes: 0,
	rest_style: "clock",
})

// The pages whose screen is kept on by default: the kitchen's, the runner's (the pass) and the customer display. Anywhere else the default is off.
export const KEEP_SCREEN_ON_SCREENS = ["kitchen", "runner", "display"]

// A day: a typo of three zeros must not mean "never"
export const MAX_MINUTES = 24 * 60

// What the control offers (0 = never). A value the registry brings that is not in the list is added to it by the control.
export const REST_AFTER_CHOICES = [0, 5, 10, 15, 30, 60, 120]
export const RELEASE_AFTER_CHOICES = [0, 15, 30, 60, 120, 240]

// Beside the other settings of these screens (pos_kds_text_size, pos_kds_layout): one key per setting
export const SCREEN_AWAKE_STORAGE_PREFIX = "pos_screen_awake_"

const SWITCHES = new Set(["keep_screen_on", "wake_on_new_ticket"])
//// Neoffice — the settings that are one word of a short list
const WORDS = { rest_style: REST_STYLES }

/**
 * One value of one setting as the setting wants it, or undefined when it is not a value of it (so that the layer below stands).
 * A switch is true or false (a registry may spell it 1, 0, "1", "0", "true", "false"); a number of minutes is a whole number from 0 (never) to a day.
 */
function clean(key, value) {
	if (WORDS[key]) return WORDS[key].includes(value) ? value : undefined
	if (SWITCHES.has(key)) {
		if (value === true || value === 1 || value === "1" || value === "true")
			return true
		if (value === false || value === 0 || value === "0" || value === "false")
			return false
		return undefined
	}
	if (
		typeof value === "boolean" ||
		value === null ||
		value === undefined ||
		(typeof value === "string" && value.trim() === "")
	)
		return undefined
	const minutes = Number(value)
	if (!Number.isFinite(minutes) || minutes < 0) return undefined
	return Math.min(Math.floor(minutes), MAX_MINUTES)
}

/** @returns {Record<string, boolean|number>} the values of a layer that are values of a setting, nothing else */
function cleanLayer(layer) {
	const kept = {}
	for (const key of SCREEN_AWAKE_KEYS) {
		const value = clean(key, layer?.[key])
		if (value !== undefined) kept[key] = value
	}
	return kept
}

/**
 * The built-in defaults of a screen.
 *
 * @param {string} [screen] - "kitchen", "runner", "display"; anything else is a screen that does not keep itself on
 * @returns {Record<string, boolean|number>}
 */
export function defaultSettings(screen) {
	return {
		...SCREEN_AWAKE_DEFAULTS,
		keep_screen_on: KEEP_SCREEN_ON_SCREENS.includes(screen),
	}
}

/**
 * The settings a screen runs on: the built-in defaults, then the restaurant's values, then this device's.
 *
 * @param {{ screen?: string, restaurant?: object, device?: object }} layers
 * @returns {{ keep_screen_on: boolean, rest_after_minutes: number, wake_on_new_ticket: boolean, release_wake_lock_after_minutes: number, rest_style: string }}
 */
export function resolveSettings({ screen, restaurant, device } = {}) {
	return {
		...defaultSettings(screen),
		...cleanLayer(restaurant),
		...cleanLayer(device),
	}
}

/**
 * The browser's storage, or null when the window refuses it. Even reading the property can throw (a sandboxed frame, site data blocked), so it is
 * never touched outside a try.
 */
function browserStorage() {
	try {
		return window.localStorage || null
	} catch {
		return null
	}
}

/**
 * What this device kept.
 *
 * @param {Storage|null} [storage] - Where to look, the browser's by default
 * @returns {Record<string, boolean|number>} Only the settings the device holds a valid value for; nothing when it holds none or the storage refuses
 */
export function readDeviceSettings(storage = browserStorage()) {
	const kept = {}
	if (!storage) return kept
	for (const key of SCREEN_AWAKE_KEYS) {
		try {
			const value = clean(
				key,
				storage.getItem(SCREEN_AWAKE_STORAGE_PREFIX + key),
			)
			if (value !== undefined) kept[key] = value
		} catch {
			// A storage that refuses: the defaults stand
		}
	}
	return kept
}

/**
 * Keeps one setting on this device.
 *
 * @param {string} key - One of SCREEN_AWAKE_KEYS
 * @param {boolean|number} value
 * @param {Storage|null} [storage]
 * @returns {boolean} false when it is not a setting or not a value of it, or could not be kept; the screen runs on the choice all the same, for as long as it is open
 */
export function saveDeviceSetting(key, value, storage = browserStorage()) {
	if (!SCREEN_AWAKE_KEYS.includes(key)) return false
	const cleaned = clean(key, value)
	if (cleaned === undefined) return false
	try {
		if (!storage) return false
		storage.setItem(
			SCREEN_AWAKE_STORAGE_PREFIX + key,
			SWITCHES.has(key) ? (cleaned ? "1" : "0") : String(cleaned),
		)
		return true
	} catch {
		return false
	}
}

/**
 * Whether a value is a value of a setting (the page asks before it takes a choice).
 *
 * @returns {boolean|number|undefined} the value as the setting keeps it, undefined when it is not one
 */
export function cleanSetting(key, value) {
	return SCREEN_AWAKE_KEYS.includes(key) ? clean(key, value) : undefined
}

// A dish alive on a ticket of the kitchen: sent and not yet delivered
const LIVE_STATUSES = new Set(["Pending", "Preparing", "Ready"])
const isLiveDish = (line) => LIVE_STATUSES.has(line?.kds_status)

/**
 * How many dishes each ticket holds, to compare one reading of the screen with the next.
 *
 * @param {object[]} orders - The tickets the screen shows (get_kds_orders, or get_runner_orders)
 * @param {{ live?: (line: object) => boolean }} [options] - Which lines count; by default the dishes sent and not delivered. The runner's orders hold only the dishes that are ready, so it counts every line.
 * @returns {Record<string, number>} ticket name -> number of live dishes; a ticket with none is left out
 */
export function ticketCounts(orders, { live = isLiveDish } = {}) {
	const counts = {}
	for (const order of orders || []) {
		if (!order?.name) continue
		const count = (order.items || []).filter((line) => live(line)).length
		if (count > 0) counts[order.name] = count
	}
	return counts
}

/**
 * Whether a reading of the screen holds a NEW ticket: one the previous reading did not have, or a dish added to one it had (a table served in rounds
 * sends its mains onto the ticket of its starters). A ticket that leaves, a dish that is delivered or the same screen read again is not new, and the
 * first reading of a screen (no previous one) is only what the next ones are compared with.
 *
 * @param {Record<string, number>|null|undefined} previous
 * @param {Record<string, number>} current
 * @returns {boolean}
 */
export function hasNewTicket(previous, current) {
	if (!previous) return false
	return Object.entries(current || {}).some(
		([name, count]) => !(name in previous) || count > previous[name],
	)
}

//// Neoffice — added file (no upstream equivalent). The till's colour mode, in ONE place (NeoRestau lot 1, task 38a-2, ruling 131). The mode (system, light,
//// dark) is the cockpit's own: it lives in localStorage under `neocockpit-colormode`, the desk's NeoCockpit toggle writes the same key, and the till
//// paints it on the page (`data-theme` and the `dark` class of <html>). Three places needed it and each had its own copy: main.js, which adopts it before
//// the app mounts and follows the system and the other tabs; the user menu of the till, which sets it; and now the theme button of the kitchen and the
//// runner screens, which have no user menu. They all read and write it through the functions below, so that they cannot drift apart.

export const COLOR_MODE_KEY = "neocockpit-colormode"
// The resolved theme, published for the other open surfaces of the suite (the desk, Insights) which pick it up live by the storage event
export const THEME_ACTIVE_KEY = "theme_active"
export const COLOR_MODES = ["system", "light", "dark"]
const DEFAULT_MODE = "system"

const DARK_QUERY = "(prefers-color-scheme: dark)"

/** The browser's storage, or null when the window refuses it: even reading the property can throw (a sandboxed frame, site data blocked). */
function browserStorage() {
	try {
		return window.localStorage || null
	} catch {
		return null
	}
}

/** Whether the system asks for a dark look. A browser with no media queries (a test) does not. */
function systemIsDark() {
	try {
		return typeof matchMedia !== "undefined" && matchMedia(DARK_QUERY).matches
	} catch {
		return false
	}
}

/**
 * The mode kept on this device.
 *
 * @param {Storage|null} [storage] - Where to look, the browser's by default
 * @returns {"system"|"light"|"dark"} System when nothing is kept, what is kept is not a mode, or the storage refuses
 */
export function readColorMode(storage = browserStorage()) {
	try {
		const kept = storage?.getItem(COLOR_MODE_KEY)
		return COLOR_MODES.includes(kept) ? kept : DEFAULT_MODE
	} catch {
		return DEFAULT_MODE
	}
}

/**
 * The look a mode comes to: light or dark. « System » follows the system.
 *
 * @param {string} mode
 * @returns {"light"|"dark"}
 */
export function resolveTheme(mode) {
	if (mode === "light" || mode === "dark") return mode
	return systemIsDark() ? "dark" : "light"
}

/**
 * The mode after this one in the cycle of the theme button: Auto (system), Light, Dark, Auto... A mode nobody knows leads to Light, so that the
 * button always does something.
 *
 * @param {string} mode
 * @returns {"system"|"light"|"dark"}
 */
export function nextColorMode(mode) {
	const known = COLOR_MODES.indexOf(mode)
	return COLOR_MODES[(known < 0 ? 0 : known + 1) % COLOR_MODES.length]
}

/** Paint a theme on the page: the attribute the design system's dark scope reads, and the class the till's dark rules read. */
function paint(theme) {
	document.documentElement.setAttribute("data-theme", theme)
	document.documentElement.classList.toggle("dark", theme === "dark")
}

/**
 * Paint the mode kept on this device on the page. Writes nothing.
 *
 * @returns {"light"|"dark"} The theme painted
 */
export function paintColorMode() {
	const theme = resolveTheme(readColorMode())
	paint(theme)
	return theme
}

/**
 * Persist the mode on the user's Frappe account too (`User.desk_theme`): the desk cockpit reads it from its boot as the authoritative source on a fresh
 * load and deliberately never fights the server, so a desk reloaded after a change made here would ignore it. Through the ORM
 * (`frappe.client.set_value`), NOT `switch_theme`: that one writes the row directly and leaves the desk's boot cache stale, so the change would not
 * survive a reload; `set_value` runs User.on_update, which invalidates the cache. Best effort: a failure is never the user's problem.
 *
 * @param {string} mode - "system", "light" or "dark"
 */
export async function persistDeskTheme(mode) {
	try {
		const deskTheme =
			mode === "system"
				? "Automatic"
				: mode.charAt(0).toUpperCase() + mode.slice(1)
		const csrf = window.csrf_token || ""
		const user = await fetch("/api/method/frappe.auth.get_logged_user", {
			headers: { "X-Frappe-CSRF-Token": csrf },
		})
			.then((response) => response.json())
			.then((body) => body.message)
			.catch(() => null)
		if (!user || user === "Guest") return
		await fetch("/api/method/frappe.client.set_value", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Frappe-CSRF-Token": csrf,
			},
			body: JSON.stringify({
				doctype: "User",
				name: user,
				fieldname: "desk_theme",
				value: deskTheme,
			}),
		})
	} catch {
		// Best effort
	}
}

/**
 * Set the colour mode: keep it on the device, paint it, and publish the resolved theme for the other open surfaces.
 *
 * @param {string} mode - "system", "light" or "dark" (anything else is the default)
 * @param {{ persistDeskTheme?: boolean }} [options] - Also write the user's `desk_theme`. The user menu of the till does, as it always did. A device that signed
 *   in with an account of its own (a kitchen tablet) is no desk user and must not touch a desk's setting
 * @returns {"light"|"dark"} The theme painted
 */
export function applyColorMode(
	mode,
	{ persistDeskTheme: persist = false } = {},
) {
	const chosen = COLOR_MODES.includes(mode) ? mode : DEFAULT_MODE
	const storage = browserStorage()
	try {
		storage?.setItem(COLOR_MODE_KEY, chosen)
	} catch {
		// The choice holds for as long as the page is open
	}
	const theme = resolveTheme(chosen)
	paint(theme)
	try {
		storage?.setItem(THEME_ACTIVE_KEY, theme)
	} catch {
		// The other surfaces will read the mode, not the theme
	}
	if (persist) persistDeskTheme(chosen)
	return theme
}

/**
 * Adopt the shared colour mode before the app mounts, so that the page opens in the right theme with no flash, and keep following it: the system's
 * change (while the mode is « system »), and a change made elsewhere (the desk's cockpit toggle, another tab) by the storage event.
 */
export function syncColorMode() {
	paintColorMode()
	try {
		matchMedia(DARK_QUERY).addEventListener("change", paintColorMode)
	} catch {
		// No media queries here
	}
	window.addEventListener("storage", (event) => {
		if (event.key === COLOR_MODE_KEY || event.key === THEME_ACTIVE_KEY)
			paintColorMode()
	})
}

//// Neoffice — added file (no upstream equivalent). The logic of the till's settings screen (NeoRestau lot 1, task 13):
//// the screen is drawn from the list the server sends (pos_next.till_settings.api.get_till_settings), and this works
//// out, from that list alone, the rail of tabs, the columns of a tab, which setting is greyed by another, what changed
//// since the screen was read and what a save must refresh at the till.

// Settings kept on this computer (browser storage), saved by the screen itself
export const STOCK_SYNC_KEY = "pos_stock_sync_settings"
export const STOCK_SYNC_DEFAULTS = { enabled: false, intervalSeconds: 60 }

// The two sections of the rail: the restaurant's tabs (a restaurant till only), then the till's
export function railSections(screen) {
	const tabs = screen?.tabs || []
	return [
		{ key: "restaurant", tabs: tabs.filter((tab) => tab.section === "restaurant") },
		{ key: "till", tabs: tabs.filter((tab) => tab.section === "till") },
	].filter((section) => section.tabs.length > 0)
}

// The tab the screen opens on: the one asked for when it is there, else the first (the restaurant's on a restaurant till)
export function openingTab(screen, asked) {
	const tabs = screen?.tabs || []
	if (asked && tabs.some((tab) => tab.key === asked)) return asked
	return tabs[0]?.key || ""
}

// The groups of a tab in their columns, each with its settings in the order of the list
export function columnsOf(screen, tabKey) {
	if (!screen) return []
	const groups = (screen.groups || []).filter((group) => group.tab === tabKey)
	const columns = new Map()
	for (const group of groups) {
		const settings = (screen.settings || []).filter((setting) => setting.group === group.key)
		if (!settings.length) continue
		if (!columns.has(group.column)) columns.set(group.column, [])
		columns.get(group.column).push({ ...group, settings })
	}
	return [...columns.keys()].sort((a, b) => a - b).map((column) => columns.get(column))
}

// Whether a value counts as "on" for a condition: a ticked box, a chosen link, a filled text, a non-empty list
export function isOn(value) {
	if (Array.isArray(value)) return value.length > 0
	if (typeof value === "string") return value.trim() !== "" && value !== "0"
	return Boolean(value)
}

// Whether the conditions of a setting hold (it can then be set); otherwise the screen shows it greyed
export function conditionsHold(setting, values) {
	return (setting.depends_on || []).every((when) => {
		const value = values?.[when.key]
		if (when.off) return !isOn(value)
		if (when.equals !== null && when.equals !== undefined) return String(value ?? "") === when.equals
		return isOn(value)
	})
}

function sameValue(a, b) {
	return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

// The values of the till's documents that changed since the screen was read: what a save sends, and nothing else
export function changedValues(settings, read, draft) {
	const changed = {}
	for (const setting of settings || []) {
		if (setting.store !== "document" || !setting.editable) continue
		if (!(setting.key in (draft || {}))) continue
		if (!sameValue(read?.[setting.key], draft[setting.key])) changed[setting.key] = draft[setting.key]
	}
	return changed
}

// What the till must refresh once these settings are saved, besides its own settings ("catalogue", "profile",
// "restaurant": the `applies` of the list)
export function effectsOf(settings, changedKeys) {
	const byKey = Object.fromEntries((settings || []).map((setting) => [setting.key, setting]))
	return new Set(changedKeys.map((key) => byKey[key]?.applies).filter(Boolean))
}

// The settings of this computer, read from the browser's storage (the screen works without it)
export function readStockSync() {
	try {
		const saved = JSON.parse(localStorage.getItem(STOCK_SYNC_KEY) || "null")
		return {
			stock_sync_enabled: (saved?.enabled ?? STOCK_SYNC_DEFAULTS.enabled) ? 1 : 0,
			stock_sync_interval: saved?.intervalSeconds ?? STOCK_SYNC_DEFAULTS.intervalSeconds,
		}
	} catch {
		return { stock_sync_enabled: 0, stock_sync_interval: STOCK_SYNC_DEFAULTS.intervalSeconds }
	}
}

// A number kept within the bounds of its setting (a value out of them is never saved)
export function withinBounds(setting, value) {
	const number = Number(value)
	if (!Number.isFinite(number)) return false
	if (setting.min !== null && setting.min !== undefined && number < setting.min) return false
	if (setting.max !== null && setting.max !== undefined && number > setting.max) return false
	return true
}

//// Neoffice — added file (no upstream equivalent). The key matching behind useGlobalShortcuts:
//// shortcuts that need no function key. A Mac sends the F-keys to the system and some till
//// keyboards have no fn key at all, so the till also answers to "/" (item search), Mod+K
//// (customer search) and Mod+Enter (payment); Mod is Cmd on a Mac and Ctrl elsewhere. Upstream
//// binds F-keys only and skips every other key in an input or a textarea; F4, F8 and F9 behave
//// exactly as they did.

const F_KEY = /^F\d{1,2}$/;
// A scanner types faster than a hand: the same 60 ms gap as the scanner capture in useSearchInput
const SCAN_GAP_MS = 60;

/** True on macOS and iPadOS, where Cmd (metaKey) stands where Ctrl stands elsewhere. */
export function isMacPlatform() {
	return /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.platform || "");
}

/**
 * How a handlers key reads on a keycap: "Mod+k" is ⌘K on a Mac and Ctrl K elsewhere, "Mod+Enter"
 * is ⌘↵ and Ctrl ↵, while "/" and "F4" read as they are.
 */
export function shortcutLabel(shortcut, mac = isMacPlatform()) {
	const [, mod, key] = /^(Mod\+)?(.+)$/.exec(shortcut);
	const cap = key === "Enter" ? "↵" : key.length === 1 ? key.toUpperCase() : key;
	if (!mod) return cap;
	return mac ? `⌘${cap}` : `Ctrl ${cap}`;
}

// A field that owns its text: a printable shortcut must leave what is typed into it alone
function isEditable(el) {
	const tag = el?.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable === true;
}

// The handlers key a keydown stands for ("F9", "Mod+Enter", "/"), or "" when it stands for none
function shortcutOf(event) {
	const { key } = event;
	if (typeof key !== "string") return ""; // browser autofill dispatches keydowns without a key
	if (F_KEY.test(key)) return key; // whatever the modifiers, as upstream
	if (event.getModifierState?.("AltGraph")) return key; // AltGr types a character, it is no chord
	const mac = isMacPlatform();
	const mod = mac ? event.metaKey : event.ctrlKey;
	const other = mac ? event.ctrlKey : event.metaKey;
	if (mod) {
		if (other || event.shiftKey || event.altKey) return "";
		return `Mod+${key.length === 1 ? key.toLowerCase() : key}`;
	}
	return other || event.altKey ? "" : key;
}

/**
 * The keydown listener of useGlobalShortcuts. Handlers are keyed by KeyboardEvent.key ("F9", "/")
 * or by "Mod+<key>" ("Mod+k", "Mod+Enter"). F-keys and "Mod+" chords type no text, so they fire
 * from fields too; any other key gives way to a field that owns its text (input, textarea, select,
 * contenteditable) and to a barcode scan in progress. A chord is consumed: the element that has
 * focus never sees it, so its own Enter does not run as well, and a held chord acts once.
 *
 * @param {() => boolean} isBlocked - True while a dialog, lock screen or overlay is showing
 * @param {Record<string, () => void>} handlers
 * @returns {(event: KeyboardEvent) => void}
 */
export function createKeydownListener(isBlocked, handlers) {
	let lastCharAt = 0;
	return function onKeydown(event) {
		const now = Date.now();
		const midScan = now - lastCharAt < SCAN_GAP_MS;
		if (event.key?.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) lastCharAt = now;
		const shortcut = shortcutOf(event);
		const run = handlers[shortcut];
		if (!run || isBlocked()) return;
		const chord = shortcut.startsWith("Mod+");
		if (!chord && !F_KEY.test(shortcut) && (midScan || isEditable(document.activeElement))) return;
		event.preventDefault();
		if (chord) {
			event.stopPropagation();
			if (event.repeat) return;
		}
		run();
	};
}

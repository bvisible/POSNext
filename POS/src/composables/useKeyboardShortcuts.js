import { onUnmounted, watch } from "vue";
//// Neoffice — the key matching moved to utils/shortcutKeys.js, ours whole (shortcuts that need no function key).
import { createKeydownListener } from "@/utils/shortcutKeys";

/**
 * Window-level shortcuts. F-keys and "Mod+" chords type no text, so they fire from fields too;
 * any other key gives way to a field that owns its text and to a barcode scan in progress.
 *
 * @param {() => boolean} isBlocked - True while a dialog, lock screen or overlay is showing
 * @param {Record<string, () => void>} handlers - Keyed by KeyboardEvent.key ("F9", "/") or by
 *   "Mod+<key>" ("Mod+k", "Mod+Enter"), Mod being Cmd on a Mac and Ctrl elsewhere
 */
export function useGlobalShortcuts(isBlocked, handlers) {
	//// Neoffice — upstream matched event.key in a listener written here and skipped every key but the
	//// F-keys in an input or a textarea. The listener now runs in the capture phase, so a chord is
	//// decided before the element that has focus handles the key (its own Enter, for one).
	const onKeydown = createKeydownListener(isBlocked, handlers);
	window.addEventListener("keydown", onKeydown, true);
	onUnmounted(() => window.removeEventListener("keydown", onKeydown, true));
}

/**
 * Enter confirms the picker's default option while it is open. Runs in the capture
 * phase so a focused button (e.g. the dialog's close X) is not clicked instead.
 * Inputs handle their own Enter. Esc is already handled by the dialog.
 *
 * @param {import('vue').Ref<boolean>} isOpen
 * @param {(event: KeyboardEvent) => void} onEnter
 */
export function usePickerEnter(isOpen, onEnter) {
	const onKeydown = (event) => {
		if (event.key !== "Enter" || event.isComposing || ["INPUT", "TEXTAREA"].includes(event.target?.tagName)) return;
		event.preventDefault();
		event.stopPropagation();
		onEnter(event);
	};
	const stop = watch(
		isOpen,
		(open) => window[open ? "addEventListener" : "removeEventListener"]("keydown", onKeydown, true),
		{ immediate: true },
	);
	onUnmounted(() => {
		stop();
		window.removeEventListener("keydown", onKeydown, true);
	});
}

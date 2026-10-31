//// Neoffice — added file (no upstream equivalent). The Back of a phone closes the dialog it is showing instead of leaving the till
//// (NeoRestau lot 1). A waiter shows the table's QR code full screen on his phone, and what a hand reaches for to get rid of
//// a full-screen thing on a phone is the Back: the Android Back button, the iOS edge swipe. Both leave the page, and the till
//// with it: the cart on screen, mid-scan. So a dialog that is a phone's takes ONE entry of the browser's history while it is
//// shown, and the Back that follows consumes that entry instead of the page's: the dialog closes, the page stays.
////
//// The entry has the address of the page and, copied from the entry it follows, the state vue-router keeps in it (its
//// position and its locations): a Back onto the page's own entry is then, for the router, a pop onto the location it is already
//// at, which it answers with no change (router.js does not rename the tab for it). A dialog closed by its own button gives its
//// entry back, with a Back of its own, only while that entry is still the page's: after a navigation of the router the entry
//// under the page is not this dialog's to pop. No other code of the app touches the history.
import { onBeforeUnmount, toValue, watch } from "vue"

/** What the entry says in the state of the history, to tell it from the router's own entries. */
export const ENTRY_KEY = "backClosesDialog"

// Two dialogs never take each other's entry for their own
let entries = 0

/**
 * @param {import("vue").MaybeRefOrGetter<boolean>} active While true the dialog holds an entry (taken when it becomes true).
 * @param {() => void} onBack Called when the Back of the browser consumed the entry: the dialog is to close.
 */
export function useBackClosesDialog(active, onBack) {
	// The key written in the state of the entry this dialog pushed, null while it holds none
	let mine = null

	function take() {
		if (mine || typeof window === "undefined") return
		mine = `dialog-${++entries}`
		window.history.pushState(
			{ ...(window.history.state || {}), [ENTRY_KEY]: mine },
			"",
		)
		window.addEventListener("popstate", onPop)
	}

	function forget() {
		mine = null
		window.removeEventListener("popstate", onPop)
	}

	function onPop() {
		if (!mine) return
		// Still on the dialog's own entry (a Back and a Forward in a row): nothing was left behind
		if (window.history.state?.[ENTRY_KEY] === mine) return
		// The browser left the entry: it is the Back that this dialog was waiting for
		forget()
		onBack()
	}

	function give() {
		if (!mine) return
		const stillThePages = window.history.state?.[ENTRY_KEY] === mine
		forget()
		if (stillThePages) window.history.back()
	}

	watch(
		() => toValue(active),
		(on) => on && take(),
		{ immediate: true },
	)
	onBeforeUnmount(give)
}

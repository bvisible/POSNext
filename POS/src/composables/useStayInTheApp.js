//// Neoffice — added file (no upstream equivalent). The Back of a waiter's phone does not leave the till (the product owner, 08.11.2026: « pour pas que l'on puisse facilement sortir de l'application »).
//// At the first page of the app the Android Back button and the iOS edge swipe leave the page, and the installed app with it. While this is on, the page holds one entry of the browser's history above
//// its own, with the address of the page and the state vue-router keeps in it (as composables/useBackClosesDialog.js does for a dialog): the Back that follows lands on the page's own entry, and
//// the entry is put back at once, so the waiter stays where they are. A dialog's entry above it is consumed first (the Back closes the dialog), and nothing else of the app touches the history.
import { onBeforeUnmount, toValue, watch } from "vue"
import { ENTRY_KEY } from "@/composables/useBackClosesDialog"

/** What the entry says in the state of the history, to tell it from the router's own entries. */
export const STAY_KEY = "stayInTheApp"

/**
 * @param {import("vue").MaybeRefOrGetter<boolean>} active While true the page holds its entry (taken when it becomes true, given up when it becomes false).
 */
export function useStayInTheApp(active) {
	let installed = false

	function keep() {
		window.history.pushState({ ...(window.history.state || {}), [STAY_KEY]: true }, "")
	}

	function onPop() {
		const state = window.history.state || {}
		// Still on an entry of ours, or on a dialog's (its own Back is waiting for it): nothing left the page
		if (state[STAY_KEY] || state[ENTRY_KEY]) return
		// The Back reached the page's own entry: the one above it is put back, the waiter did not move
		keep()
	}

	function install() {
		if (installed || typeof window === "undefined") return
		installed = true
		keep()
		window.addEventListener("popstate", onPop)
	}

	function remove() {
		if (!installed) return
		installed = false
		window.removeEventListener("popstate", onPop)
	}

	watch(
		() => toValue(active),
		(on) => (on ? install() : remove()),
		{ immediate: true },
	)
	onBeforeUnmount(remove)
}

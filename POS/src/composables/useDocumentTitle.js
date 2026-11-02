//// Neoffice — added file (no upstream equivalent). The browser tab's title follows the page's own (NeoResto lot 1, task 38a-2, ruling 128): a
//// kitchen tablet's tab, the installed app's name and the list of windows of a desk user all read « Bar » or « Runner » instead of the name of the
//// whole till. The title the page had is put back when the page goes, so that the till does not keep a kitchen's name.
import { onBeforeUnmount, unref, watch } from "vue"

/**
 * @param {import("vue").Ref<string>|import("vue").ComputedRef<string>|string} title - What the tab says; nothing, it is left as it is
 */
export function useDocumentTitle(title) {
	const before = typeof document !== "undefined" ? document.title : ""
	watch(
		() => unref(title),
		(text) => {
			if (typeof document !== "undefined" && text) document.title = text
		},
		{ immediate: true },
	)
	onBeforeUnmount(() => {
		if (typeof document !== "undefined") document.title = before
	})
}

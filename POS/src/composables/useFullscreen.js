//// Neoffice — added file (no upstream equivalent). The till's full-screen switch (NeoResto lot 1; product owner, 05.11.2026: « on n'avait pas un bouton pour forcer le mode plein écran ? » — the desk's sidebar and
//// the customer display have one, the till had none, and a restaurant till on a tablet wants every pixel). It asks the browser for the whole page, and follows the browser's own state: Escape, a swipe or the
//// browser's menu leave full screen too, and the button then shows the right icon. Where the browser has no such API (an iPhone's Safari allows it for a video only) `supported` is false and the till draws no button.
import { onBeforeUnmount, onMounted, ref } from "vue"

export function useFullscreen() {
	const supported = typeof document !== "undefined" && typeof document.documentElement?.requestFullscreen === "function"
	const isFullscreen = ref(false)

	function sync() {
		isFullscreen.value = Boolean(document.fullscreenElement)
	}

	async function toggle() {
		if (!supported) return
		try {
			if (document.fullscreenElement) await document.exitFullscreen()
			else await document.documentElement.requestFullscreen()
		} catch {
			// denied or unsupported: the page stays as it is
		}
		sync()
	}

	onMounted(() => {
		sync()
		document.addEventListener("fullscreenchange", sync)
	})
	onBeforeUnmount(() => document.removeEventListener("fullscreenchange", sync))

	return { supported, isFullscreen, toggle }
}

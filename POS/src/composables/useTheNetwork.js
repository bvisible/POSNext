//// Neoffice — added file (no upstream equivalent). The till's network state as a ref that follows it (NeoSalon, voie 4, 19.11.2026): the sheet of an appointment and the window of a new one say
//// what needs the network instead of opening and failing without a word (the tester's replay of the offline till). Safe where the state has nothing to subscribe to.
import { onMounted, onUnmounted, ref } from "vue"
import { offlineState } from "@/utils/offline/offlineState"

export function useTheNetwork() {
	const offline = ref(Boolean(offlineState.isOffline))
	let stop = null
	onMounted(() => {
		offline.value = Boolean(offlineState.isOffline)
		if (typeof offlineState.subscribe === "function") stop = offlineState.subscribe((state) => (offline.value = Boolean(state?.isOffline)))
	})
	onUnmounted(() => {
		if (typeof stop === "function") stop()
		stop = null
	})
	return offline
}

//// Neoffice — added file (no upstream equivalent). The kitchen's choice of the side where the oldest ticket stands, shared by the bands that draw the tickets and the panel that changes it (utils/ticketSide holds the
//// rule and the storage).
import { computed, ref } from "vue"
import { readOldestSide, saveOldestSide } from "@/utils/ticketSide"

// One value for the whole page: a band and the settings panel never disagree
const side = ref(readOldestSide())

export function useTicketSide() {
	const oldestRight = computed(() => side.value === "right")
	function setOldestRight(value) {
		side.value = value ? "right" : "left"
		saveOldestSide(side.value)
	}
	return { oldestRight, setOldestRight }
}

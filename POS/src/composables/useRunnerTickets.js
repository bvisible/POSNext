//// Neoffice — added file (no upstream equivalent). The kitchen screen's choice to keep or leave off the tickets that are with the runner (NeoResto lot 1, Daniel, 01.11), shared by the bands that are drawn and the panel
//// that changes it, and kept on the device like the side of the oldest ticket (utils/runnerTickets holds the rule and the storage).
import { ref } from "vue"
import { readRunnerTickets, saveRunnerTickets } from "@/utils/runnerTickets"

// One value for the whole page: the bands and the settings panel never disagree
const showRunnerTickets = ref(readRunnerTickets())

/** @returns {{ showRunnerTickets: import("vue").Ref<boolean>, setShowRunnerTickets: (value: boolean) => void }} */
export function useRunnerTickets() {
	function setShowRunnerTickets(value) {
		showRunnerTickets.value = Boolean(value)
		saveRunnerTickets(showRunnerTickets.value)
	}
	return { showRunnerTickets, setShowRunnerTickets }
}

//// Neoffice — added file (no upstream equivalent). The tab of the till carries the till's name once a shift is open
//// ("Restaurant till · Neopos"), and says plain "Neopos" before (NeoRestau lot 1). The till is the one screen whose name
//// is not in its route: it is the POS Profile of the shift, so it is read from the shift store, which follows a shift opening,
//// a shift found open when the page loads, and a shift closing. This file imports the till's store, so only the till page
//// uses it; the kitchen and the guest pages go through useTabTitle, which imports no store.
import { useTabTitle } from "@/composables/useTabTitle"
import { usePOSShiftStore } from "@/stores/posShift"

export function useTillTabTitle() {
	const shiftStore = usePOSShiftStore()
	useTabTitle(() => (shiftStore.hasOpenShift ? shiftStore.profileName : ""))
}

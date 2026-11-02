//// Neoffice — added file (no upstream equivalent). What a service screen (the kitchen's, the runner's) needs to put a PRINTER BUTTON on its
//// cards and make it print a copy of a ticket (NeoResto lot 1, task 44): the device's four settings (utils/printCopy), the stations that
//// have a printer (asked of the server, and again every minute: a printer is plugged in or out while the screen is open), whether a card
//// draws its button, what the button says, and the print itself (utils/kitchenCopy). The screen hands in the station it is opened on and the
//// restaurant it shows; it hands the object this returns to its bands and cards, which ask `canPrint(order)`, `stateOf(order)` and `print(order)`.
import { computed, ref, unref } from "vue"
import { call } from "@/utils/apiWrapper"
import {
	copyState,
	forgetStationsWithoutPrinter,
	printCopyFromScreen,
	STATIONS_METHOD,
	withoutPrinter,
} from "@/utils/kitchenCopy"
import {
	cleanCopySetting,
	readDeviceCopySettings,
	resolveCopySettings,
	saveDeviceCopySetting,
	showsThePrintButton,
	stationsAtTheKitchen,
} from "@/utils/printCopy"

/** How often the screen asks again which stations have a printer. */
export const PRINTERS_REFRESH_MS = 60 * 1000

// A kitchen card is the order; a runner card names its order `invoiceName` (a card of the runner's view by station has none: nothing to print)
const invoiceOf = (ticket) => ticket?.invoiceName || ticket?.name || ""

/**
 * @param {"Kitchen"|"Runner"} screen
 * @param {{ station?: import("vue").Ref<string|null>, restaurant?: () => object }} [options]
 *   station: the station the screen is opened on, none for all of them. restaurant: the restaurant the screen shows, as the screen's own calls name it.
 */
export function usePrintCopy(screen, { station = ref(null), restaurant = () => ({}) } = {}) {
	// Read now, not on mount: the first paint must already be the right one
	const device = ref(readDeviceCopySettings())
	const settings = computed(() => resolveCopySettings({ device: device.value }))
	const printerStations = ref([])
	let askedAt = 0

	/** Ask which stations have a printer. A reading that fails leaves what the screen knew: it does not hide the buttons for a moment's network. */
	async function refreshPrinters({ force = false } = {}) {
		if (!force && Date.now() - askedAt < PRINTERS_REFRESH_MS) return
		askedAt = Date.now()
		try {
			const answer = await call(STATIONS_METHOD, { screen, ...restaurant() })
			printerStations.value = Array.isArray(answer?.stations) ? answer.stations : []
			forgetStationsWithoutPrinter()
		} catch {
			// The printers could not be read: the buttons stand as they were
		}
	}

	function canPrint(ticket) {
		if (!invoiceOf(ticket)) return false
		return showsThePrintButton({
			screen,
			settings: settings.value,
			printerStations: printerStations.value,
			stations: stationsAtTheKitchen(ticket.items),
			station: unref(station) || null,
			withoutPrinter: withoutPrinter.stations,
		})
	}

	const stateOf = (ticket) => copyState(invoiceOf(ticket))

	const print = (ticket) =>
		printCopyFromScreen({
			invoice: invoiceOf(ticket),
			screen,
			station: unref(station) || null,
			settings: settings.value,
		})

	/** One setting, taking effect at once and kept on this device when it can be. */
	function setSetting(key, value) {
		const cleaned = cleanCopySetting(key, value)
		if (cleaned === undefined) return
		device.value = { ...device.value, [key]: cleaned }
		saveDeviceCopySetting(key, cleaned)
	}

	return {
		screen,
		settings,
		printerStations,
		hasPrinters: computed(() => printerStations.value.length > 0),
		refreshPrinters,
		canPrint,
		stateOf,
		print,
		setSetting,
	}
}

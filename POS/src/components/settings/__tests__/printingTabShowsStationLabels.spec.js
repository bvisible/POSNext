/**
 * //// Neoffice — added file (no upstream equivalent). The Printing tab lists the preparation stations of the till's
 * //// restaurant with the printer of each (NeoResto lot 1, task 2). A new station is named by a hash, so the tab
 * //// shows its label, and keeps the printer under the name the printer rows keep. Since task 13 the choice goes
 * //// into the screen's draft, saved with the rest by its one « Save », no longer on each change.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

const { default: CloudPrntTillSettings } = await import("../CloudPrntTillSettings.vue")
const { useCloudPrntStore } = await import("@/stores/cloudPrnt")

const STATION_NAME = "h4sh0f4stn"
const PRINTING = {
	printers: [{ name: "PRINTER-1", label: "Pass printer", online: true }],
	receipt_printer: null,
	auto_print: 0,
	open_drawer: "Cash payments",
	can_configure: true,
	stations: [
		{ station: STATION_NAME, station_name: "Kitchen", station_type: "Kitchen", printer: null },
		// A station of an older site is named by its label and may carry none
		{ station: "Bar", station_type: "Bar", printer: null },
	],
}
const DRAFT = { receipt_printer: null, auto_print: 0, open_drawer: "Cash payments", stations: {} }
const DEFINITIONS = {
	station_printers: { label: "Printer of each station", help: "The printer that prints the tickets" },
}

async function stationsPart() {
	setActivePinia(createPinia())
	call.mockReset()
	call.mockResolvedValue(PRINTING)
	await useCloudPrntStore().load("Till 1")
	const wrapper = mount(CloudPrntTillSettings, {
		props: { part: "stations", modelValue: DRAFT, definitions: DEFINITIONS },
		global: { mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	return wrapper
}

describe("the printing tab lists the stations of the till by label", () => {
	beforeEach(() => call.mockReset())

	it("shows the label of a station and never its hash name", async () => {
		const wrapper = await stationsPart()

		const labels = wrapper.findAll("label").map((label) => label.text())
		expect(labels).toContain("Kitchen")
		expect(labels).not.toContain(STATION_NAME)
	})

	it("shows the name of a station that has no label", async () => {
		const wrapper = await stationsPart()

		expect(wrapper.findAll("label").map((label) => label.text())).toContain("Bar")
	})

	it("keeps the printer of a station under the name the printer rows keep, for the screen's Save", async () => {
		const wrapper = await stationsPart()
		call.mockClear()

		await wrapper.find(`#cloudprnt-station-${STATION_NAME}`).setValue("PRINTER-1")
		await flushPromises()

		expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([
			{ ...DRAFT, stations: { [STATION_NAME]: "PRINTER-1" } },
		])
		// Nothing is written on a change any more: the screen's one Save writes it
		expect(call).not.toHaveBeenCalled()
	})

	it("gives each station's printer its help behind the lightbulb", async () => {
		const wrapper = await stationsPart()

		const bulbs = wrapper.findAll("button[aria-label='Help']")
		expect(bulbs).toHaveLength(PRINTING.stations.length)
		expect(bulbs[0].attributes("title")).toBe(DEFINITIONS.station_printers.help)
	})
})

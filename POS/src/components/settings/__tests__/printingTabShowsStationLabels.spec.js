/**
 * //// Neoffice — added file (no upstream equivalent). The Printing tab lists the preparation stations of the till's
 * //// restaurant with the printer of each (NeoRestau lot 1, task 2). A new station is named by a hash, so the tab
 * //// shows its label, and still saves the printer under the name the printer rows keep.
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

async function printingTab() {
	setActivePinia(createPinia())
	call.mockReset()
	call.mockResolvedValue(PRINTING)
	const wrapper = mount(CloudPrntTillSettings, {
		props: { posProfile: "Till 1" },
		global: { mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	return wrapper
}

describe("the printing tab lists the stations of the till by label", () => {
	beforeEach(() => call.mockReset())

	it("shows the label of a station and never its hash name", async () => {
		const wrapper = await printingTab()

		const labels = wrapper.findAll("label").map((label) => label.text())
		expect(labels).toContain("Kitchen")
		expect(labels).not.toContain(STATION_NAME)
	})

	it("shows the name of a station that has no label", async () => {
		const wrapper = await printingTab()

		expect(wrapper.findAll("label").map((label) => label.text())).toContain("Bar")
	})

	it("saves the printer of a station under the name the printer rows keep", async () => {
		const wrapper = await printingTab()
		call.mockResolvedValue(PRINTING)

		await wrapper.find(`#cloudprnt-station-${STATION_NAME}`).setValue("PRINTER-1")
		await flushPromises()

		expect(call).toHaveBeenCalledWith("cloudprnt.till.set_till_printing", {
			pos_profile: "Till 1",
			receipt_printer: null,
			stations: { [STATION_NAME]: "PRINTER-1" },
		})
	})
})

/**
 * //// Neoffice — added file (no upstream equivalent). The Printing tab lets a station work on paper alone (NeoResto lot 1, Daniel, 02.11.2026): no screen, the
 * //// ticket is all the kitchen reads. It needs a printer, so the choice is greyed while the station has none, and taking the printer away takes the choice with it.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { describe, expect, it, vi } from "vitest"

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

const PRINTING = {
	printers: [{ name: "P1", label: "Pass printer", online: true }],
	receipt_printer: null,
	auto_print: 0,
	open_drawer: "Cash payments",
	can_configure: true,
	stations: [
		{ station: "Kitchen", station_name: "Kitchen", printer: "P1", paper_only: 1 },
		{ station: "Bar", station_name: "Bar", printer: null, paper_only: 0 },
	],
}
const DRAFT = { receipt_printer: null, auto_print: 0, open_drawer: "Cash payments", stations: {}, paper_only: {} }

async function stationsPart(draft = DRAFT) {
	setActivePinia(createPinia())
	call.mockReset()
	call.mockResolvedValue(PRINTING)
	await useCloudPrntStore().load("Till 1")
	const wrapper = mount(CloudPrntTillSettings, {
		props: { part: "stations", modelValue: draft, definitions: {} },
		global: { mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	return wrapper
}

describe("a station that works on paper alone", () => {
	it("is checked as the station says today", async () => {
		const wrapper = await stationsPart()

		expect(wrapper.find("#cloudprnt-paper-Kitchen").element.checked).toBe(true)
	})

	it("cannot be chosen for a station that has no printer", async () => {
		const wrapper = await stationsPart()

		const bar = wrapper.find("#cloudprnt-paper-Bar").element
		expect(bar.disabled).toBe(true)
		expect(bar.checked).toBe(false)
	})

	it("can be chosen once the station has a printer on this screen", async () => {
		const wrapper = await stationsPart({ ...DRAFT, stations: { Bar: "P1" } })

		expect(wrapper.find("#cloudprnt-paper-Bar").element.disabled).toBe(false)
	})

	it("puts the choice into the draft for the screen's Save", async () => {
		const wrapper = await stationsPart({ ...DRAFT, stations: { Bar: "P1" } })

		await wrapper.find("#cloudprnt-paper-Bar").setValue(true)

		expect(wrapper.emitted("update:modelValue").at(-1)[0].paper_only).toEqual({ Bar: 1 })
	})

	it("is given up with the printer: a station with a screen only cannot work on paper alone", async () => {
		const wrapper = await stationsPart()

		await wrapper.find("#cloudprnt-station-Kitchen").setValue("")

		const draft = wrapper.emitted("update:modelValue").at(-1)[0]
		expect(draft.stations).toEqual({ Kitchen: null })
		expect(draft.paper_only).toEqual({ Kitchen: 0 })
	})
})

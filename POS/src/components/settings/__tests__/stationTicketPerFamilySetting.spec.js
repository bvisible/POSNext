/**
 * //// Neoffice — added file (no upstream equivalent). The Printing tab lets a station print one ticket for each family of a send (NeoResto lot 1, Daniel, 03.11.2026:
 * //// « quand ça part en cuisine, c'est entrée, plat, dessert : un seul ticket, ou trois tickets »). A checkbox under each station, off when the station says nothing; it
 * //// needs a printer, so it is greyed while the station has none; the choice goes into the draft for the screen's Save.
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
		{ station: "Kitchen", station_name: "Kitchen", printer: "P1", paper_only: 0, text_size: "Medium", ticket_per_family: 1 },
		{ station: "Bar", station_name: "Bar", printer: null, paper_only: 0, text_size: "Medium" },
		{ station: "Pizza", station_name: "Pizza", printer: "P1", paper_only: 0, text_size: "Medium" },
	],
}
const DRAFT = { receipt_printer: null, auto_print: 0, open_drawer: "Cash payments", stations: {}, paper_only: {}, text_size: {}, ticket_per_family: {} }

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

const boxes = (wrapper) => wrapper.findAll('[data-setting="station_ticket_per_family"] input[type="checkbox"]')

describe("a ticket for each family of a station", () => {
	it("is a checkbox under each station, named in words", async () => {
		const wrapper = await stationsPart()

		expect(boxes(wrapper)).toHaveLength(3)
		expect(wrapper.text()).toContain("One ticket per family")
	})

	it("is what the station says today", async () => {
		const wrapper = await stationsPart()

		expect(boxes(wrapper).map((box) => box.element.checked)).toEqual([true, false, false])
	})

	it("cannot be chosen for a station that has no printer", async () => {
		const wrapper = await stationsPart()

		expect(boxes(wrapper)[1].element.disabled).toBe(true)
		expect(boxes(wrapper)[0].element.disabled).toBe(false)
	})

	it("puts the choice into the draft for the screen's Save", async () => {
		const wrapper = await stationsPart()

		await boxes(wrapper)[2].setValue(true)

		expect(wrapper.emitted("update:modelValue").at(-1)[0].ticket_per_family).toEqual({ Pizza: 1 })
	})

	it("keeps the choices of the other stations when one is changed, and says 0 for a box that is unticked", async () => {
		const wrapper = await stationsPart({ ...DRAFT, ticket_per_family: { Pizza: 1 } })

		await boxes(wrapper)[0].setValue(false)

		expect(wrapper.emitted("update:modelValue").at(-1)[0].ticket_per_family).toEqual({ Pizza: 1, Kitchen: 0 })
	})
})

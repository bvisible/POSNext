/**
 * //// Neoffice — added file (no upstream equivalent). The Printing tab lets a station choose how big the writing of its kitchen tickets is (NeoResto lot 1, Daniel,
 * //// 03.11.2026: « un petit peu plus petites »). Large, Medium or Small; Medium when the station says nothing; it needs a printer, so the choice is greyed while the station has none.
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
		{ station: "Kitchen", station_name: "Kitchen", printer: "P1", paper_only: 0, text_size: "Small" },
		{ station: "Bar", station_name: "Bar", printer: null, paper_only: 0 },
	],
}
const DRAFT = { receipt_printer: null, auto_print: 0, open_drawer: "Cash payments", stations: {}, paper_only: {}, text_size: {} }

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

const sizes = (wrapper, index) =>
	wrapper.findAll('[data-setting="station_text_size"]')[index].findAll('[role="radio"]')

describe("the size of the writing of a station's tickets", () => {
	it("offers large, medium and small", async () => {
		const wrapper = await stationsPart()

		expect(sizes(wrapper, 0).map((button) => button.text())).toEqual(["Large", "Medium", "Small"])
	})

	it("is the one the station says today", async () => {
		const wrapper = await stationsPart()

		expect(sizes(wrapper, 0).map((button) => button.attributes("aria-checked"))).toEqual(["false", "false", "true"])
	})

	it("is medium for a station that says nothing", async () => {
		const wrapper = await stationsPart({ ...DRAFT, stations: { Bar: "P1" } })

		expect(sizes(wrapper, 1).map((button) => button.attributes("aria-checked"))).toEqual(["false", "true", "false"])
	})

	it("cannot be chosen for a station that has no printer", async () => {
		const wrapper = await stationsPart()

		expect(sizes(wrapper, 1).every((button) => button.element.disabled)).toBe(true)
		expect(sizes(wrapper, 0).every((button) => !button.element.disabled)).toBe(true)
	})

	it("puts the choice into the draft for the screen's Save", async () => {
		const wrapper = await stationsPart()

		await sizes(wrapper, 0)[0].trigger("click")

		expect(wrapper.emitted("update:modelValue").at(-1)[0].text_size).toEqual({ Kitchen: "Large" })
	})

	it("keeps the choices of the other stations when one is changed", async () => {
		const wrapper = await stationsPart({ ...DRAFT, stations: { Bar: "P1" }, text_size: { Kitchen: "Large" } })

		await sizes(wrapper, 1)[2].trigger("click")

		expect(wrapper.emitted("update:modelValue").at(-1)[0].text_size).toEqual({ Kitchen: "Large", Bar: "Small" })
	})
})

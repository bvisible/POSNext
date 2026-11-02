/**
 * //// Neoffice — added file (no upstream equivalent). The text size of the kitchen screen (NeoResto lot 1, task 38a-1, ruling 109): the
 * //// screen ships DENSE (Compact), a small « Aa » button in its header cycles Compact, Normal, Large, Extra large, the choice is kept on
 * //// the DEVICE, and the sizes reach the tickets as CSS variables on the page's root (font sizes, paddings, button heights).
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	tillRestaurant: "The Bistro",
	runnerEnabled: true,
}))

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/socket", () => ({ initSocket: () => null }))

const { default: KDS } = await import("../KDS.vue")

const KEY = "pos_kds_text_size"

function serve() {
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method.endsWith("get_kds_orders"))
			return [
				{
					name: "A",
					area: "",
					restaurant_table: "t1",
					table_display_name: "T1",
					kds_status: "Pending",
					creation: "2026-10-30 12:00:00",
					modified: "2026-10-30 12:00:00",
					items: [
						{
							item_code: "SOUP",
							item_name: "Soup",
							qty: 1,
							kds_status: "Pending",
						},
					],
				},
			]
		if (method.endsWith("get_tables"))
			return { areas: [], tables: [], stations: [] }
		return []
	})
}

let opened = []
async function open() {
	window.history.replaceState({}, "", "/pos/kds")
	const wrapper = mount(KDS, {
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
beforeEach(() => {
	opened = []
	localStorage.clear()
	serve()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
})

const root = (wrapper) => wrapper.get('[data-test="kitchen-screen"]')
const variable = (wrapper, name) =>
	root(wrapper).element.style.getPropertyValue(name)

describe("the text size of the kitchen screen", () => {
	it("opens DENSE: Compact, 13 px dishes, on a device that has never been asked", async () => {
		const wrapper = await open()

		expect(root(wrapper).attributes("data-text-size")).toBe("compact")
		expect(variable(wrapper, "--kds-fs")).toBe("13px")
		expect(variable(wrapper, "--kds-btn-h")).toBe("36px")
	})

	it("has a small Aa button in its header that names the size it is at", async () => {
		const wrapper = await open()

		const button = wrapper.get('[data-test="text-size"]')
		expect(button.text()).toContain("Aa")
		expect(button.attributes("aria-label")).toBe("Text size: Compact")
		expect(wrapper.get("header").element.contains(button.element)).toBe(true)
		// Four pips, one more lit at each size
		expect(wrapper.findAll('[data-test="text-size-pip"]')).toHaveLength(4)
	})

	it("cycles Compact, Normal, Large, Extra large, Compact on each press, and the variables follow at once", async () => {
		const wrapper = await open()
		const button = wrapper.get('[data-test="text-size"]')

		const seen = []
		for (let press = 0; press < 4; press += 1) {
			await button.trigger("click")
			seen.push([
				root(wrapper).attributes("data-text-size"),
				variable(wrapper, "--kds-fs"),
				button.attributes("aria-label"),
			])
		}

		expect(seen).toEqual([
			["normal", "15px", "Text size: Normal"],
			["large", "18px", "Text size: Large"],
			["xl", "22px", "Text size: Extra large"],
			["compact", "13px", "Text size: Compact"],
		])
	})

	it("lights one more pip at each size", async () => {
		const wrapper = await open()
		const lit = () =>
			wrapper
				.findAll('[data-test="text-size-pip"]')
				.filter((pip) => pip.classes().includes("bg-blue-400")).length

		expect(lit()).toBe(1)
		await wrapper.get('[data-test="text-size"]').trigger("click")
		expect(lit()).toBe(2)
		await wrapper.get('[data-test="text-size"]').trigger("click")
		expect(lit()).toBe(3)
	})

	it("is kept on the device: the next time the screen opens, it opens at the size the cook chose", async () => {
		const first = await open()
		await first.get('[data-test="text-size"]').trigger("click")
		await first.get('[data-test="text-size"]').trigger("click")
		expect(localStorage.getItem(KEY)).toBe("large")
		first.unmount()

		const second = await open()

		expect(root(second).attributes("data-text-size")).toBe("large")
		expect(variable(second, "--kds-fs")).toBe("18px")
		expect(variable(second, "--kds-py")).toBe("7px")
	})

	it("hands the sizes to the tickets: they are inside the root that carries the variables", async () => {
		const wrapper = await open()

		const card = wrapper.get('[data-test="ticket"]')
		expect(root(wrapper).element.contains(card.element)).toBe(true)
		// The card reads them with the dense ones as its fallback
		expect(card.get('[data-test="ticket-title"]').classes()).toContain(
			"!text-[length:var(--kds-fs-table,15px)]",
		)
	})

	it("is not touched by a storage that refuses: the screen opens on the default and the button still cycles", async () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
			if (key === KEY) throw new Error("denied")
			return null
		})
		vi.spyOn(Storage.prototype, "setItem").mockImplementation((key) => {
			if (key === KEY) throw new Error("denied")
		})

		const wrapper = await open()
		expect(root(wrapper).attributes("data-text-size")).toBe("compact")
		await wrapper.get('[data-test="text-size"]').trigger("click")

		expect(root(wrapper).attributes("data-text-size")).toBe("normal")
	})
})

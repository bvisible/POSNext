/**
 * //// Neoffice — added file (no upstream equivalent). The control of the screen's four awake settings, in the top bar of the kitchen and runner screens,
 * //// beside the size of the text (NeoRestau lot 1, task 47): keep the screen on, rest after N minutes, wake on a new ticket, let the tablet sleep after N
 * //// more minutes of rest, each with a one-line help. One icon button of 44 px that opens a small panel; the panel holds nothing the page keeps: it shows
 * //// the settings it is given and says what the person changed.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

const { default: ScreenAwakeSettings } = await import(
	"../ScreenAwakeSettings.vue"
)
const { default: ServiceTopBar } = await import("../ServiceTopBar.vue")

const SETTINGS = {
	keep_screen_on: true,
	rest_after_minutes: 30,
	wake_on_new_ticket: true,
	release_wake_lock_after_minutes: 0,
	rest_style: "clock",
}

let opened = []
function open(props = {}) {
	const wrapper = mount(ScreenAwakeSettings, {
		props: { settings: SETTINGS, wakeLockSupported: true, ...props },
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	opened.push(wrapper)
	return wrapper
}
const button = (wrapper) => wrapper.get('[data-test="awake-settings"]')
const menu = (wrapper) => wrapper.find('[data-test="awake-settings-menu"]')
async function openMenu(props) {
	const wrapper = open(props)
	await button(wrapper).trigger("click")
	return wrapper
}

beforeEach(() => {
	opened = []
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
})

describe("the button of the awake settings", () => {
	it("is a button of 44 px that names itself and opens a panel, closed to begin with", () => {
		const wrapper = open()

		expect(button(wrapper).classes()).toEqual(
			expect.arrayContaining(["h-11", "w-11"]),
		)
		expect(button(wrapper).attributes("aria-label")).toBe(
			"Screen: keep on and rest",
		)
		expect(button(wrapper).attributes("aria-expanded")).toBe("false")
		expect(menu(wrapper).exists()).toBe(false)
	})

	it("opens on a tap, and closes on the next", async () => {
		const wrapper = await openMenu()
		expect(menu(wrapper).exists()).toBe(true)
		expect(button(wrapper).attributes("aria-expanded")).toBe("true")

		await button(wrapper).trigger("click")

		expect(menu(wrapper).exists()).toBe(false)
	})

	it("closes on Escape and on a tap outside it", async () => {
		const wrapper = await openMenu()
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
		await wrapper.vm.$nextTick()
		expect(menu(wrapper).exists()).toBe(false)

		await button(wrapper).trigger("click")
		expect(menu(wrapper).exists()).toBe(true)
		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
		await wrapper.vm.$nextTick()
		expect(menu(wrapper).exists()).toBe(false)
	})

	it("stays open when something inside the panel is pressed", async () => {
		const wrapper = await openMenu()

		await wrapper.get('[data-test="awake-wake-on-ticket"]').trigger("click")

		expect(menu(wrapper).exists()).toBe(true)
	})
})

describe("the two choices of the kitchen's screen, in the same panel (Daniel, 01.11)", () => {
	it("draws neither where the page hands neither: the runner's screen has no such choice", async () => {
		const wrapper = await openMenu()

		expect(wrapper.find('[data-test="course-order"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="oldest-right"]').exists()).toBe(false)
	})

	it("shows the order of the meal and the side of the oldest ticket as switches, as they are", async () => {
		const wrapper = await openMenu({ courseOrder: true, oldestRight: false })

		expect(wrapper.get('[data-test="course-order"]').attributes("aria-checked")).toBe("true")
		expect(wrapper.get('[data-test="oldest-right"]').attributes("aria-checked")).toBe("false")
		expect(wrapper.text()).toContain("Follow the order of the meal")
		expect(wrapper.text()).toContain("Oldest ticket on the right")
	})

	it("says what a switch was turned to, and keeps the panel open", async () => {
		const wrapper = await openMenu({ courseOrder: true, oldestRight: false })

		await wrapper.get('[data-test="course-order"]').trigger("click")
		await wrapper.get('[data-test="oldest-right"]').trigger("click")

		expect(wrapper.emitted("course-order")).toEqual([[false]])
		expect(wrapper.emitted("oldest-right")).toEqual([[true]])
		expect(menu(wrapper).exists()).toBe(true)
	})
})

//// Neoffice — the tickets that are with the runner, kept or left off this screen (Daniel, 01.11): drawn only where the page hands the value (the kitchen's screen, where a station has a runner)
describe("the tickets with the runner, in the same panel", () => {
	it("is not drawn where the page hands no value", async () => {
		const wrapper = await openMenu({ courseOrder: true, oldestRight: false })

		expect(wrapper.find('[data-test="runner-tickets"]').exists()).toBe(false)
	})

	it("shows a switch as it is, with its line of help", async () => {
		const wrapper = await openMenu({ runnerTickets: true })

		expect(wrapper.get('[data-test="runner-tickets"]').attributes("aria-checked")).toBe("true")
		expect(wrapper.text()).toContain("Show the tickets with the runner")
		expect(wrapper.get('[data-test="runner-tickets-help"]').text().length).toBeGreaterThan(10)
	})

	it("says what it was turned to, and keeps the panel open", async () => {
		const wrapper = await openMenu({ runnerTickets: true })

		await wrapper.get('[data-test="runner-tickets"]').trigger("click")

		expect(wrapper.emitted("runner-tickets")).toEqual([[false]])
		expect(menu(wrapper).exists()).toBe(true)
	})
})

describe("the four settings", () => {
	it("are listed with their name and a line of help each", async () => {
		const wrapper = await openMenu()
		const text = menu(wrapper).text()

		for (const words of [
			"Keep the screen on",
			"The tablet does not go to sleep while this screen is open.",
			"Rest the screen after",
			"After this long without a touch the screen goes dark. A touch wakes it.",
			"The screen at rest shows",
			"The big clock tells the time. The black screen shows nothing at all.",
			"Wake on a new ticket",
			"A new ticket lights the screen again.",
			"Let the tablet sleep after",
			"After this long at rest, the tablet's own auto-lock takes over.",
		])
			expect(text).toContain(words)
		expect(wrapper.findAll('[data-test="awake-help"]')).toHaveLength(5)
	})

	it("show the switches as they are", async () => {
		const wrapper = await openMenu({
			settings: { ...SETTINGS, keep_screen_on: false },
		})

		expect(
			wrapper.get('[data-test="awake-keep-on"]').attributes("aria-checked"),
		).toBe("false")
		expect(
			wrapper
				.get('[data-test="awake-wake-on-ticket"]')
				.attributes("aria-checked"),
		).toBe("true")
	})

	it("draw a switch with no class the till's dark remap flattens: `bg-white` and `bg-gray-50/100/200/300` get an `!important` colour in dark mode, which made a switch that is on look like one that is off (measured in a browser)", async () => {
		const wrapper = await openMenu()

		for (const name of ["awake-keep-on", "awake-wake-on-ticket"]) {
			const track = wrapper.get(`[data-test="${name}"]`)
			const thumb = track.get("span")
			for (const classes of [track.classes(), thumb.classes()])
				expect(
					classes.filter((c) =>
						/^bg-(?:white|gray-(?:50|100|200|300))$/.test(c),
					),
				).toEqual([])
		}
	})

	it("say what a switch was turned to", async () => {
		const wrapper = await openMenu()

		await wrapper.get('[data-test="awake-keep-on"]').trigger("click")
		await wrapper.get('[data-test="awake-wake-on-ticket"]').trigger("click")

		expect(wrapper.emitted("change")).toEqual([
			["keep_screen_on", false],
			["wake_on_new_ticket", false],
		])
	})

	it("offer the minutes, with Never first, the one in force chosen", async () => {
		const wrapper = await openMenu()
		const select = wrapper.get('[data-test="awake-rest-after"]')

		expect(select.findAll("option").map((option) => option.text())).toEqual([
			"Never",
			"5 min",
			"10 min",
			"15 min",
			"30 min",
			"60 min",
			"120 min",
		])
		expect(select.element.value).toBe("30")
	})

	it("say the minutes chosen as a number, and 0 for never", async () => {
		const wrapper = await openMenu()
		const select = wrapper.get('[data-test="awake-rest-after"]')

		await select.setValue("10")
		await select.setValue("0")

		expect(wrapper.emitted("change")).toEqual([
			["rest_after_minutes", 10],
			["rest_after_minutes", 0],
		])
	})

	it("offer to rest as the big clock or as plain black, the clock to begin with, and say the word chosen (Daniel, 01.11)", async () => {
		const wrapper = await openMenu()
		const select = wrapper.get('[data-test="awake-rest-style"]')

		expect(select.findAll("option").map((option) => option.text())).toEqual(["Big clock", "Black screen"])
		expect(select.element.value).toBe("clock")

		await select.setValue("black")

		expect(wrapper.emitted("change")).toEqual([["rest_style", "black"]])
	})

	it("show the style in force chosen, and the choice is not offered while the screen never rests", async () => {
		const wrapper = await openMenu({ settings: { ...SETTINGS, rest_style: "black" } })
		expect(wrapper.get('[data-test="awake-rest-style"]').element.value).toBe("black")

		await wrapper.unmount()
		const never = await openMenu({ settings: { ...SETTINGS, rest_after_minutes: 0 } })
		expect(never.get('[data-test="awake-rest-style"]').attributes("disabled")).toBeDefined()
	})

	it("add a value the restaurant brought to the choices, and show it chosen", async () => {
		const wrapper = await openMenu({
			settings: { ...SETTINGS, rest_after_minutes: 45 },
		})
		const select = wrapper.get('[data-test="awake-rest-after"]')

		expect(select.findAll("option").map((option) => option.text())).toContain(
			"45 min",
		)
		expect(select.element.value).toBe("45")
	})

	it("the tablet's own sleep: Never to begin with, and not offered while the screen never rests", async () => {
		const wrapper = await openMenu()
		const release = wrapper.get('[data-test="awake-release-after"]')
		expect(release.element.value).toBe("0")
		expect(release.attributes("disabled")).toBeUndefined()

		await wrapper.setProps({ settings: { ...SETTINGS, rest_after_minutes: 0 } })

		expect(release.attributes("disabled")).toBeDefined()
	})

	it("say when the browser cannot keep the screen on, and say nothing when it can", async () => {
		const without = await openMenu({ wakeLockSupported: false })
		expect(without.find('[data-test="awake-unsupported"]').text()).toBe(
			"Not available on this browser.",
		)

		const withIt = await openMenu({ wakeLockSupported: true })
		expect(withIt.find('[data-test="awake-unsupported"]').exists()).toBe(false)
	})
})

describe("in the top bar", () => {
	it("stands beside the size of the text, before the theme, and adds no row", () => {
		const wrapper = mount(ServiceTopBar, {
			props: { title: "Kitchen", count: "2 orders" },
			slots: {
				screen: '<button data-test="awake-slot">screen</button>',
				theme: '<button data-test="theme-slot">theme</button>',
			},
			global: { mocks: { __: globalThis.__ } },
		})
		const order = wrapper
			.findAll(
				'[data-test="text-size"], [data-test="awake-slot"], [data-test="theme-slot"], [data-test="refresh"]',
			)
			.map((node) => node.attributes("data-test"))

		expect(order).toEqual(["text-size", "awake-slot", "theme-slot", "refresh"])
		expect(wrapper.findAll('[data-test="top-bar-row1"]')).toHaveLength(1)
	})
})

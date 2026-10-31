/**
 * //// Neoffice — added file (no upstream equivalent). « Open a tablet » at the till (NeoRestau lot 1, task 16): the
 * //// manager chooses the screen, the dialog shows the QR code of a one-time code and the time it stays valid, notices
 * //// the tablet opening, and lists the restaurant's tablets with who paired them, when they were last seen, and
 * //// « Disconnect ». The entry shows only to whoever may set the restaurant up.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const toString = vi.hoisted(() => vi.fn(async (url) => `<svg data-url="${url}"></svg>`))
const showError = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({ can: {}, tillRestaurant: "The Bistro" }))

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, index) => args[index]) : text)
})

vi.mock("frappe-ui", () => ({
	Dialog: {
		props: ["modelValue", "options"],
		template: "<div v-if='modelValue' data-test='dialog'><h2>{{ options.title }}</h2><slot name='body-content' /></div>",
	},
}))
vi.mock("qrcode", () => ({ default: { toString } }))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showError, showSuccess: vi.fn() }) }))
vi.mock("@/utils/currency", () => ({
	formatTime: (value) => `time of ${value}`,
	formatDateTime: (value) => `date of ${value}`,
}))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurantStore }))

const { default: OpenTabletDialog } = await import("../OpenTabletDialog.vue")
const { default: OpenTabletButton } = await import("../OpenTabletButton.vue")

const API = "pos_next.api.restaurant_devices"
const URL_OF_THE_CODE = "https://bistro.example/pos/pair#Zx3_kQ-9aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const STATIONS = [{ name: "st-grill", station_name: "Grill", restaurant: "The Bistro" }]
const TABLETS = [
	{
		name: "dev-1",
		device_name: "Kitchen — Grill",
		screen: "Kitchen",
		station: "st-grill",
		station_name: "Grill",
		paired_by_name: "Anne Martin",
		paired_at: "2026-10-30 18:00:00",
		last_seen: "2026-10-29 21:05:00",
		disconnected: false,
		sessions: 2,
	},
	{
		name: "dev-2",
		device_name: "Runner",
		screen: "Runner",
		station: null,
		station_name: "",
		paired_by_name: "Paul Favre",
		paired_at: "2026-10-28 18:00:00",
		last_seen: null,
		disconnected: true,
		sessions: 0,
	},
]

let tablets
let opened = []

function answer(method, params) {
	if (method === "pos_next.api.restaurant.get_preparation_stations") return STATIONS
	if (method === `${API}.get_devices`) return tablets
	if (method === `${API}.create_pairing_code`) {
		return { url: URL_OF_THE_CODE, expires_in: 300, screen: params.screen, station: params.station }
	}
	if (method === `${API}.disconnect_device`) return { ended_sessions: 1 }
	if (method === `${API}.retire_pairing_codes`) return { retired: true }
	return null
}

function open(component = OpenTabletDialog, props = { modelValue: true, restaurant: "The Bistro" }) {
	const wrapper = mount(component, { props, global: { mocks: { __: globalThis.__ } } })
	opened.push(wrapper)
	return wrapper
}

const asked = (method) => call.mock.calls.filter(([name]) => name === method).map(([, params]) => params)

beforeEach(() => {
	tablets = TABLETS.map((tablet) => ({ ...tablet }))
	call.mockReset()
	call.mockImplementation(async (method, params) => answer(method, params))
	toString.mockClear()
	showError.mockReset()
	opened = []
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.useRealTimers()
})

describe("opening a tablet at the till", () => {
	it("offers the kitchen of every station, the kitchen of each station, and the runner", async () => {
		const wrapper = open()
		await flushPromises()

		const choices = wrapper.findAll("[data-test=screen-choices] button").map((button) => button.text())
		expect(choices).toEqual(["Kitchen, all stations", "Kitchen — Grill", "Runner"])
		expect(asked("pos_next.api.restaurant.get_preparation_stations")).toEqual([{ restaurant: "The Bistro" }])
	})

	it("shows the QR code of a code made for the screen chosen, with the time it stays valid", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test=screen-kitchen-st-grill]").trigger("click")
		await flushPromises()

		expect(asked(`${API}.create_pairing_code`)).toEqual([
			{ screen: "Kitchen", station: "st-grill", restaurant: "The Bistro" },
		])
		expect(toString).toHaveBeenCalledWith(URL_OF_THE_CODE, expect.objectContaining({ type: "svg" }))
		expect(wrapper.get("[data-test=pairing-qr]").html()).toContain(`data-url="${URL_OF_THE_CODE}"`)
		expect(wrapper.get("[data-test=pairing-time-left]").text()).toBe("Valid for 5:00")

		await vi.advanceTimersByTimeAsync(31_000)
		expect(wrapper.get("[data-test=pairing-time-left]").text()).toBe("Valid for 4:29")
	})

	it("says when the code has expired, and makes a new one on request", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
		const wrapper = open()
		await flushPromises()
		await wrapper.get("[data-test=screen-runner]").trigger("click")
		await flushPromises()

		await vi.advanceTimersByTimeAsync(300_000)

		expect(wrapper.find("[data-test=pairing-time-left]").exists()).toBe(false)
		expect(wrapper.get("[data-test=pairing-expired]").text()).toBe("This code has expired.")
		await wrapper.get("[data-test=pairing-new-code]").trigger("click")
		await flushPromises()
		expect(asked(`${API}.create_pairing_code`)).toEqual([
			{ screen: "Runner", station: null, restaurant: "The Bistro" },
			{ screen: "Runner", station: null, restaurant: "The Bistro" },
		])
		expect(wrapper.get("[data-test=pairing-time-left]").text()).toBe("Valid for 5:00")
	})

	it("notices the tablet opening, and stops showing a code it has spent", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
		const wrapper = open()
		await flushPromises()
		await wrapper.get("[data-test=screen-kitchen-st-grill]").trigger("click")
		await flushPromises()

		// The grill's tablet scans the code: the list says it was paired again
		tablets[0] = { ...tablets[0], paired_at: "2026-10-30 21:40:00", last_seen: "2026-10-30 21:40:02" }
		await vi.advanceTimersByTimeAsync(4_000)

		expect(wrapper.get("[data-test=pairing-done]").text()).toBe("The tablet is open.")
		expect(wrapper.find("[data-test=pairing-qr]").exists()).toBe(false)
	})

	it("lists the restaurant's tablets: who paired each one, when it was last seen, which are disconnected", async () => {
		const wrapper = open()
		await flushPromises()

		expect(asked(`${API}.get_devices`)).toEqual([{ restaurant: "The Bistro" }])
		const grill = wrapper.get("[data-test=tablet-dev-1]").text()
		expect(grill).toContain("Kitchen — Grill")
		expect(grill).toContain("Paired by Anne Martin")
		expect(grill).toContain("Last seen: date of 2026-10-29 21:05:00")
		expect(wrapper.find("[data-test=disconnect-dev-1]").exists()).toBe(true)
		// A row is a screen: it says on how many tablets it is open
		expect(wrapper.get("[data-test=open-on-dev-1]").text()).toBe("Open on 2 tablets")
		const runner = wrapper.get("[data-test=tablet-dev-2]").text()
		expect(runner).toContain("Runner")
		expect(runner).toContain("Not seen yet")
		expect(runner).toContain("Disconnected")
		expect(wrapper.find("[data-test=disconnect-dev-2]").exists()).toBe(false)
		expect(wrapper.find("[data-test=open-on-dev-2]").exists()).toBe(false)
	})

	it("says a screen open on one tablet, or on none", async () => {
		tablets[0] = { ...tablets[0], sessions: 1 }
		tablets[1] = { ...tablets[1], disconnected: false, sessions: 0 }
		const wrapper = open()
		await flushPromises()

		expect(wrapper.get("[data-test=open-on-dev-1]").text()).toBe("Open on 1 tablet")
		expect(wrapper.get("[data-test=open-on-dev-2]").text()).toBe("Open on no tablet")
	})

	it("retires the tokens it made, and nobody used, when it closes", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
		const wrapper = open()
		await flushPromises()
		await wrapper.get("[data-test=screen-kitchen-st-grill]").trigger("click")
		await flushPromises()
		expect(asked(`${API}.retire_pairing_codes`)).toEqual([])

		await wrapper.setProps({ modelValue: false })
		await flushPromises()
		expect(asked(`${API}.retire_pairing_codes`)).toEqual([{ restaurant: "The Bistro" }])

		// Closed for good: nothing more to retire
		wrapper.unmount()
		opened = opened.filter((one) => one !== wrapper)
		expect(asked(`${API}.retire_pairing_codes`)).toHaveLength(1)
	})

	it("asks nothing to be retired when it made no token", async () => {
		const wrapper = open()
		await flushPromises()

		wrapper.unmount()
		opened = opened.filter((one) => one !== wrapper)
		expect(asked(`${API}.retire_pairing_codes`)).toEqual([])
	})

	it("disconnects a tablet once the manager confirms", async () => {
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test=disconnect-dev-1]").trigger("click")
		expect(asked(`${API}.disconnect_device`)).toEqual([])
		expect(wrapper.get("[data-test=confirm-dev-1]").text()).toContain("must scan a new code")

		tablets[0] = { ...tablets[0], disconnected: true }
		await wrapper.get("[data-test=disconnect-confirm-dev-1]").trigger("click")
		await flushPromises()

		expect(asked(`${API}.disconnect_device`)).toEqual([{ device: "dev-1" }])
		expect(wrapper.get("[data-test=tablet-dev-1]").text()).toContain("Disconnected")
	})

	it("says so when the server refuses a code", async () => {
		call.mockImplementation(async (method, params) => {
			if (method === `${API}.create_pairing_code`) throw Object.assign(new Error("Not permitted"), { status: 403 })
			return answer(method, params)
		})
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test=screen-kitchen]").trigger("click")
		await flushPromises()

		expect(showError).toHaveBeenCalledWith("Could not create a code.")
		expect(wrapper.find("[data-test=pairing-qr]").exists()).toBe(false)
	})
})

describe("the entry « Open a tablet »", () => {
	it("is shown to whoever may set the restaurant up, and opens the dialog", async () => {
		restaurantStore.can = { manage_settings: true }
		const wrapper = open(OpenTabletButton, {})
		await flushPromises()

		await wrapper.get("[data-test=open-a-tablet]").trigger("click")
		await flushPromises()

		expect(wrapper.get("[data-test=dialog] h2").text()).toBe("Open a tablet")
		expect(asked(`${API}.get_devices`)).toEqual([{ restaurant: "The Bistro" }])
	})

	it("is not shown to a cashier", async () => {
		restaurantStore.can = { manage_floor: true }
		const wrapper = open(OpenTabletButton, {})
		await flushPromises()

		expect(wrapper.find("[data-test=open-a-tablet]").exists()).toBe(false)
		expect(call).not.toHaveBeenCalled()
	})
})

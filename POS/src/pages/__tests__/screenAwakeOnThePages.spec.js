/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen, the runner and the customer displays keep their screen on and let it rest on purpose
 * //// (NeoRestau lot 1, task 47). The product owner's tablet fell asleep by itself in the kitchen. On each page: the browser's Screen Wake Lock is asked for; after
 * //// 30 minutes without a touch a near-black layer is drawn (a web page cannot switch the screen off nor dim it) with a small clock and the number of waiting orders;
 * //// the first touch wakes it WITHOUT pressing the control under the finger; a new ticket wakes it; the control beside the size of the text changes the settings
 * //// of this device. The customer displays hold the lock and never rest. The browser, the clock and the server are mocked.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	tillRestaurant: "The Bistro",
	runnerEnabled: true,
	fetchRestaurantSettings: async () => {},
}))

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	FeatherIcon: { template: "<i />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/socket", () => ({ initSocket: () => null }))
// The second screen's store signs in and polls the till: here it is a signed-out one, which is all the page needs to mount
vi.mock("@/stores/customerDisplay", () => ({
	useCustomerDisplayStore: () => ({
		isAuthenticated: false,
		posOpeningEntry: null,
		posProfile: null,
		posProfiles: [],
		connectionError: null,
		cartData: {},
		tryRestoreSession: async () => {},
		stopCartSync: () => {},
	}),
}))

const { default: KDS } = await import("../KDS.vue")
const { default: Runner } = await import("../Runner.vue")
const { default: CFD } = await import("../CFD.vue")
const { default: CustomerDisplay } = await import("../CustomerDisplay.vue")

const MINUTE = 60 * 1000
const wait = (ms) => vi.advanceTimersByTimeAsync(ms)

let kitchenOrders
let runnerOrders
function serve() {
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method.endsWith("get_kds_orders")) return kitchenOrders
		if (method.endsWith("get_runner_orders")) return runnerOrders
		if (method.endsWith("get_tables"))
			return { areas: [], tables: [], stations: [] }
		return []
	})
}
const kitchenOrder = (name, ...statuses) => ({
	name,
	area: "",
	restaurant_table: `table-${name}`,
	table_display_name: `T-${name}`,
	kds_status: "Pending",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	items: statuses.map((kds_status, i) => ({
		name: `${name}-${i}`,
		item_code: "SOUP",
		item_name: "Soup",
		qty: 1,
		kds_status,
	})),
})
const readyOrder = (name) => ({
	name,
	area: "",
	restaurant_table: `table-${name}`,
	table_display_name: `T-${name}`,
	kds_status: "Ready",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	items: [
		{
			name: `${name}-0`,
			item_name: "Dish",
			qty: 1,
			kds_status: "Ready",
			preparation_station: "kit",
			station_name: "Cuisine",
			station_color: "#4A6B8F",
		},
	],
})

// ---- the browser's Screen Wake Lock, as a mock ----
let sentinels
let request
function installWakeLock() {
	sentinels = []
	request = vi.fn(async (type) => {
		const sentinel = new EventTarget()
		sentinel.type = type
		sentinel.release = vi.fn(async () =>
			sentinel.dispatchEvent(new Event("release")),
		)
		sentinels.push(sentinel)
		return sentinel
	})
	Object.defineProperty(navigator, "wakeLock", {
		configurable: true,
		value: { request },
	})
}

let opened = []
async function open(component, path, options = {}) {
	window.history.replaceState({}, "", path)
	const wrapper = mount(component, {
		global: {
			stubs: {
				RunnerOrderCard: { template: "<div data-test='card' />" },
				KDSOrderCard: { template: "<div data-test='card' />" },
				...(options.stubs || {}),
			},
			mocks: { __: globalThis.__, $router: { push: vi.fn() } },
		},
		attachTo: document.body,
	})
	opened.push(wrapper)
	await wait(0)
	return wrapper
}
const fire = (target, type, Kind = Event) =>
	target.dispatchEvent(new Kind(type, { bubbles: true, cancelable: true }))
async function tap(target) {
	fire(target, "pointerdown")
	fire(target, "mousedown", MouseEvent)
	await wait(60)
	fire(target, "pointerup")
	fire(target, "mouseup", MouseEvent)
	fire(target, "click", MouseEvent)
}

beforeEach(() => {
	vi.useFakeTimers()
	opened = []
	localStorage.clear()
	kitchenOrders = [kitchenOrder("A", "Pending")]
	runnerOrders = [readyOrder("A")]
	serve()
	installWakeLock()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	Object.defineProperty(navigator, "wakeLock", {
		configurable: true,
		value: undefined,
	})
	vi.useRealTimers()
})

// The kitchen reads its orders every 15 seconds, the runner every 30
describe.each([
	["kitchen", KDS, "/pos/kds", () => kitchenOrders, "1 order waiting"],
	["runner", Runner, "/pos/runner", () => runnerOrders, "1 item ready"],
])("the %s screen", (_name, component, path, _orders, restWords) => {
	const POLL_MS = component === KDS ? 15 * 1000 : 30 * 1000
	it("asks the browser to keep the screen on", async () => {
		await open(component, path)

		expect(request).toHaveBeenCalledTimes(1)
		expect(request).toHaveBeenCalledWith("screen")
	})

	it("has the control of the awake settings in the top bar, between the size of the text and the theme, on the bar's only row", async () => {
		const wrapper = await open(component, path)
		const order = wrapper
			.findAll(
				'[data-test="text-size"], [data-test="awake-settings"], [data-test="theme-button"], [data-test="refresh"]',
			)
			.map((node) => node.attributes("data-test"))

		expect(order).toEqual([
			"text-size",
			"awake-settings",
			"theme-button",
			"refresh",
		])
		expect(wrapper.findAll('[data-test="top-bar-row1"]')).toHaveLength(1)
	})

	it("draws nothing dark while the screen is awake", async () => {
		const wrapper = await open(component, path)

		await wait(29 * MINUTE)

		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(false)
	})

	it("rests after 30 minutes without a touch: a near-black layer with the clock and the waiting count, while the lock is kept", async () => {
		const wrapper = await open(component, path)

		await wait(30 * MINUTE)

		const layer = wrapper.get('[data-test="screen-rest"]')
		expect(layer.classes()).toContain("bg-black")
		expect(layer.get('[data-test="rest-count"]').text()).toBe(restWords)
		expect(layer.get('[data-test="rest-clock"]').text()).toMatch(
			/^\d{2}:\d{2}$/,
		)
		expect(sentinels[0].release).not.toHaveBeenCalled()
	})

	it("is woken by a touch that does NOT press the control under the finger, then the next touch presses it", async () => {
		const wrapper = await open(component, path)
		await wait(30 * MINUTE)
		const sizeButton = wrapper.get('[data-test="text-size"]').element

		await tap(sizeButton)

		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(false)
		expect(
			wrapper
				.get(`[data-test="${component === KDS ? "kitchen" : "runner"}-screen"]`)
				.attributes("data-text-size"),
		).toBe("compact")

		await wait(1000)
		await tap(sizeButton)

		expect(
			wrapper
				.get(`[data-test="${component === KDS ? "kitchen" : "runner"}-screen"]`)
				.attributes("data-text-size"),
		).toBe("normal")
	})

	it("is woken by a new ticket (the next reading of the server), and rests again 30 minutes after it", async () => {
		const wrapper = await open(component, path)
		await wait(30 * MINUTE)
		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(true)

		if (component === KDS)
			kitchenOrders = [...kitchenOrders, kitchenOrder("B", "Pending")]
		else runnerOrders = [...runnerOrders, readyOrder("B")]
		await wait(POLL_MS)

		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(false)
		await wait(29 * MINUTE)
		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(false)
		await wait(MINUTE)
		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(true)
	})

	it("is not woken by a ticket that leaves", async () => {
		kitchenOrders = [kitchenOrder("A", "Pending"), kitchenOrder("B", "Pending")]
		runnerOrders = [readyOrder("A"), readyOrder("B")]
		const wrapper = await open(component, path)
		await wait(30 * MINUTE)

		kitchenOrders = [kitchenOrder("A", "Pending")]
		runnerOrders = [readyOrder("A")]
		await wait(POLL_MS)

		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(true)
	})

	it("is not woken by a new ticket when this device said no", async () => {
		localStorage.setItem("pos_screen_awake_wake_on_new_ticket", "0")
		const wrapper = await open(component, path)
		await wait(30 * MINUTE)

		if (component === KDS)
			kitchenOrders = [...kitchenOrders, kitchenOrder("B", "Pending")]
		else runnerOrders = [...runnerOrders, readyOrder("B")]
		await wait(POLL_MS)

		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(true)
	})

	it("changes the minutes from the control, and the device keeps the choice", async () => {
		const wrapper = await open(component, path)

		await wrapper.get('[data-test="awake-settings"]').trigger("click")
		await wrapper.get('[data-test="awake-rest-after"]').setValue("5")

		expect(localStorage.getItem("pos_screen_awake_rest_after_minutes")).toBe(
			"5",
		)
		await wait(5 * MINUTE)
		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(true)
	})

	it("never rests when the device says never, and still keeps the screen on", async () => {
		localStorage.setItem("pos_screen_awake_rest_after_minutes", "0")
		const wrapper = await open(component, path)

		await wait(5 * 60 * MINUTE)

		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(false)
		expect(request).toHaveBeenCalledTimes(1)
	})

	it("keeps the screen on only if the device has it on: switched off from the control, the lock is let go", async () => {
		const wrapper = await open(component, path)

		await wrapper.get('[data-test="awake-settings"]').trigger("click")
		await wrapper.get('[data-test="awake-keep-on"]').trigger("click")
		await wait(0)

		expect(localStorage.getItem("pos_screen_awake_keep_screen_on")).toBe("0")
		expect(sentinels[0].release).toHaveBeenCalled()
	})
})

describe("the kitchen screen's waiting count", () => {
	it("counts the tickets in which nothing has begun, in the singular and the plural", async () => {
		kitchenOrders = [
			kitchenOrder("A", "Pending"),
			kitchenOrder("B", "Pending"),
			kitchenOrder("C", "Preparing"),
		]
		const wrapper = await open(KDS, "/pos/kds")

		await wait(30 * MINUTE)

		expect(wrapper.get('[data-test="rest-count"]').text()).toBe(
			"2 orders waiting",
		)
	})

	it("is woken by a dish added to a ticket it knew (a table served in rounds)", async () => {
		const wrapper = await open(KDS, "/pos/kds")
		await wait(30 * MINUTE)

		kitchenOrders = [kitchenOrder("A", "Preparing", "Pending")]
		await wait(15 * 1000)

		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(false)
	})
})

describe("the customer displays", () => {
	function stubBroadcastChannel() {
		vi.stubGlobal(
			"BroadcastChannel",
			class {
				close() {}
			},
		)
	}

	it("the display of the till (cfd) keeps the screen on and never rests", async () => {
		stubBroadcastChannel()
		const wrapper = await open(CFD, "/pos/cfd")

		await wait(24 * 60 * MINUTE)

		expect(request).toHaveBeenCalledWith("screen")
		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(false)
		vi.unstubAllGlobals()
	})

	it("the second screen (display) keeps the screen on through the same composable, and again when the page comes back", async () => {
		const wrapper = await open(CustomerDisplay, "/pos/display", {
			stubs: {
				DisplayAuth: true,
				DisplayHeader: true,
				DisplayCart: true,
				CreateCustomerModal: true,
			},
		})
		expect(wrapper.exists()).toBe(true)
		expect(request).toHaveBeenCalledTimes(1)

		// the browser lets the lock go when the page is hidden
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			get: () => "hidden",
		})
		document.dispatchEvent(new Event("visibilitychange"))
		sentinels[0].dispatchEvent(new Event("release"))
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			get: () => "visible",
		})
		document.dispatchEvent(new Event("visibilitychange"))
		await wait(0)

		expect(request).toHaveBeenCalledTimes(2)
		await wait(24 * 60 * MINUTE)
		expect(wrapper.find('[data-test="screen-rest"]').exists()).toBe(false)
	})
})

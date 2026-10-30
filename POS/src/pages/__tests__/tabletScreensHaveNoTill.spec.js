/**
 * //// Neoffice — added file (no upstream equivalent). A kitchen's or a runner's tablet signs in with an account of its
 * //// own, paired by a QR code at the till (NeoRestau lot 1, task 16). Its screen has no till behind it: no « Back to
 * //// POS ». When the tablet is disconnected at the till, or its session ends, the screen's next poll is refused with
 * //// the browser signed out: it goes to the pairing page, which says how to open it again, instead of piling up
 * //// error messages.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const showError = vi.hoisted(() => vi.fn())
const session = vi.hoisted(() => ({ isDeskSession: vi.fn(), leaveWhenSignedOut: vi.fn() }))
const restaurantStore = vi.hoisted(() => ({
	runnerEnabled: true,
	tillRestaurant: undefined,
	fetchRestaurantSettings: async () => {},
}))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({ Button: { template: "<button><slot /></button>" } }))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showSuccess: vi.fn(), showError }) }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurantStore }))
vi.mock("@/socket", () => ({ initSocket: () => null }))
vi.mock("@/utils/tabletSession", () => session)

const { default: KDS } = await import("../KDS.vue")
const { default: Runner } = await import("../Runner.vue")

const ORDERS_OF = {
	KDS: "pos_next.api.restaurant.get_kds_orders",
	Runner: "pos_next.api.restaurant.get_runner_orders",
}
const SCREENS = [
	["KDS", KDS, "/pos/kds?restaurant=The+Bistro"],
	["Runner", Runner, "/pos/runner?restaurant=The+Bistro"],
]
// What frappe-ui's call throws when Frappe refuses a visitor: the 403's body is an HTML redirect it cannot read
const REFUSED = new TypeError("Cannot read properties of undefined (reading 'exc_type')")

let opened = []
function mountScreen(Screen, address) {
	window.history.replaceState({}, "", address)
	const wrapper = mount(Screen, {
		global: { stubs: { KDSOrderCard: true, FloorPlanWalls: true }, mocks: { __: globalThis.__, $router: { push: vi.fn() } } },
	})
	opened.push(wrapper)
	return wrapper
}

const hasBackToTheTill = (wrapper) => wrapper.findAll("button").some((button) => button.text() === "Back to POS")

beforeEach(() => {
	call.mockReset()
	call.mockImplementation(async () => [])
	showError.mockReset()
	session.isDeskSession.mockReset()
	session.leaveWhenSignedOut.mockReset()
	opened = []
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
})

describe.each(SCREENS)("the %s screen", (name, Screen, address) => {
	it("has no way back to a till on a tablet's own account", async () => {
		session.isDeskSession.mockReturnValue(false)

		const wrapper = mountScreen(Screen, address)
		await flushPromises()

		expect(hasBackToTheTill(wrapper)).toBe(false)
	})

	it("keeps « Back to POS » for a desk account", async () => {
		session.isDeskSession.mockReturnValue(true)

		const wrapper = mountScreen(Screen, address)
		await flushPromises()

		expect(hasBackToTheTill(wrapper)).toBe(true)
	})

	it("goes to the pairing page when its poll is refused with the tablet signed out, with no error message", async () => {
		session.isDeskSession.mockReturnValue(false)
		session.leaveWhenSignedOut.mockReturnValue(true)
		call.mockImplementation(async (method) => {
			if (method === ORDERS_OF[name]) throw REFUSED
			return []
		})

		mountScreen(Screen, address)
		await flushPromises()

		expect(session.leaveWhenSignedOut).toHaveBeenCalled()
		expect(showError).not.toHaveBeenCalled()
	})

	it("still says so when a poll fails with the session alive", async () => {
		session.isDeskSession.mockReturnValue(true)
		session.leaveWhenSignedOut.mockReturnValue(false)
		call.mockImplementation(async (method) => {
			if (method === ORDERS_OF[name]) throw new Error("Server down")
			return []
		})

		mountScreen(Screen, address)
		await flushPromises()

		expect(showError).toHaveBeenCalled()
	})
})

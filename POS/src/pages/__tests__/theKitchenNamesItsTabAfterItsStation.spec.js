/**
 * //// Neoffice — added file (no upstream equivalent). The tab of the kitchen screen says "Kitchen · Neopos", and with a
 * //// station chosen on the screen or named in the bookmark, the station comes first: "Bar · Kitchen · Neopos"
 * //// (NeoRestau lot 1). A kitchen tablet, a bar tablet and the till side by side are told apart by their tab.
 * //// The page is mounted as the kitchen's other specs mount it, with the server answering the stations; the route's own
 * //// word, "Kitchen", comes from the real router, as its afterEach hands it over when the visitor arrives.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	tillRestaurant: "The Bistro",
	runnerEnabled: true,
}))
const words = vi.hoisted(() => {
	const words = { catalogue: {} }
	globalThis.__ = (msgid, args) => {
		const text = words.catalogue[msgid] ?? msgid
		return args ? text.replace(/\{(\d+)\}/g, (_, i) => args[i]) : text
	}
	return words
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
// The router is only asked for the route of the kitchen: its other imports are not under test
vi.mock("@/composables/useShift", () => ({ shiftState: {} }))
vi.mock("@/data/user", () => ({ userResource: {} }))
vi.mock("@/data/session", () => ({ session: { isLoggedIn: true } }))

const { default: KDS } = await import("../KDS.vue")
const { default: router } = await import("../../router")
const { showScreen } = await import("@/utils/tabTitle")

const STATIONS_READ = "pos_next.api.restaurant.get_preparation_stations"
const TABLES = "pos_next.api.restaurant.get_tables"
const KDS_ORDERS = "pos_next.api.restaurant.get_kds_orders"
const STATIONS = [
	{ name: "bar", station_name: "Bar", color: "#2C4FA8" },
	{ name: "grill", station_name: "Grill", color: "#D68A59" },
]

const Ticket = {
	props: ["order"],
	template: '<div class="ticket">{{ order.name }}</div>',
}

let opened = []
/** The kitchen screen as a visitor arrives on it: the router names its tab first, then the page loads. */
async function open(search = "") {
	window.history.replaceState({}, "", `/pos/kds${search}`)
	showScreen(router.resolve("/kds"))
	const wrapper = mount(KDS, {
		global: {
			stubs: { KDSOrderCard: Ticket },
			mocks: { __: globalThis.__ },
		},
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}

async function choose(wrapper, label) {
	const chip = wrapper
		.findAll('[data-test="stations"] button')
		.find((button) => button.text().replace(/\s+/g, " ").startsWith(label))
	if (!chip) throw new Error(`no station chip starts with ${label}`)
	await chip.trigger("click")
	await flushPromises()
}

beforeEach(() => {
	localStorage.clear()
	opened = []
	words.catalogue = {}
	document.title = "Neopos"
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method === STATIONS_READ) return STATIONS
		if (method === TABLES) return { areas: [], tables: [], stations: [] }
		if (method === KDS_ORDERS) return []
		return []
	})
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
})

describe("the tab of the kitchen screen", () => {
	it("says Kitchen while no station is chosen", async () => {
		await open()

		expect(document.title).toBe("Kitchen · Neopos")
	})

	it("puts first the station a bookmark names", async () => {
		await open("?station=bar")

		expect(document.title).toBe("Bar · Kitchen · Neopos")
	})

	it("follows the station chosen on the screen, and drops it when the choice is taken back", async () => {
		const wrapper = await open()

		await choose(wrapper, "Grill")
		expect(document.title).toBe("Grill · Kitchen · Neopos")

		await choose(wrapper, "Bar")
		expect(document.title).toBe("Bar · Kitchen · Neopos")

		await choose(wrapper, "Bar")
		expect(document.title).toBe("Kitchen · Neopos")

		await choose(wrapper, "Grill")
		await choose(wrapper, "All")
		expect(document.title).toBe("Kitchen · Neopos")
	})

	it("ignores a bookmark that names a station the restaurant does not have", async () => {
		await open("?station=ghost")

		expect(document.title).toBe("Kitchen · Neopos")
	})

	it("says the word of the screen in French and leaves the station's name as the restaurant wrote it", async () => {
		words.catalogue = { Kitchen: "Cuisine" }

		await open("?station=bar")

		expect(document.title).toBe("Bar · Cuisine · Neopos")
	})
})

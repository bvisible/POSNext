/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen's ticket where the kitchen prepares ahead (NeoRestau lot 1, the service rhythm, Daniel, 01.11: « Oui, les deux modes »). The later courses are on the
 * //// ticket from « Valider », marked « À l'avance »: the cooks may start and finish them, the order of the meal (the device's rule that greys the later courses) is off, a dish finished before its course is called is
 * //// « Prêt d'avance » (a state of its own, not a dish at the pass), and nothing counts from a dish nobody has called: no timer, no late colour, no main button. The card is mounted for real.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { ref } from "vue"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))

vi.mock("frappe-ui", () => ({
	createResource: vi.fn(),
	Button: { template: "<button><slot /></button>" },
}))
vi.mock("@/utils/offline/translationCache", () => ({ translationCache: {} }))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ runnerEnabled: true }),
}))

let KDSOrderCard
let SERVICE_RHYTHM_KEY
beforeAll(async () => {
	globalThis.__ = (text, args) => (args ? text.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : text)
	;({ default: KDSOrderCard } = await import("../KDSOrderCard.vue"))
	;({ SERVICE_RHYTHM_KEY } = await import("@/utils/serviceRhythm"))
})

const SENT = "2026-11-01 18:00:00"
const CALLED = "2026-11-01 18:40:00"

beforeEach(() => {
	call.mockClear()
	window.innerWidth = 1280
	window.innerHeight = 800
	window.localStorage.clear()
	// 19:00: an hour after the table was sent, twenty minutes after the mains were called
	vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
	vi.setSystemTime(new Date("2026-11-01T19:00:00"))
})

let opened = []
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	opened = []
	vi.useRealTimers()
})

const dish = (name, family, status = "Pending", extra = {}) => ({
	item_code: `ITEM-${name}`,
	item_name: name,
	qty: 1,
	kds_status: status,
	service_family: family,
	kds_batch: 1,
	kds_sent_at: SENT,
	preparation_station: "kit",
	...extra,
})
/** A dish sent ahead of its course; `calledAt` is the room's call (none: not called yet). */
const ahead = (name, family, status = "Pending", calledAt = null, extra = {}) =>
	dish(name, family, status, { kds_ahead: 1, kds_called_at: calledAt, ...extra })

function show(items, props = {}, rhythm = "Prepared ahead") {
	const wrapper = mount(KDSOrderCard, {
		props: {
			order: {
				name: "SINV-AHEAD",
				restaurant_table: "T1",
				table_display_name: "T1",
				kds_status: "Pending",
				creation: "2026-11-01 17:55:00",
				modified: "2026-11-01 18:00:00",
				items,
			},
			showStationBadge: false,
			courseOrder: true,
			...props,
		},
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ }, provide: { [SERVICE_RHYTHM_KEY]: ref(rhythm) } },
	})
	opened.push(wrapper)
	return wrapper
}
const nameOf = (row) => {
	const copy = row.get('[data-test="ticket-dish-name"]').element.cloneNode(true)
	for (const pill of copy.querySelectorAll(
		'[data-test="ticket-line-state"], [data-test="ticket-station-tag"], [data-test="ticket-line-sent"], [data-test="ticket-line-ahead"]',
	))
		pill.remove()
	return copy.textContent.trim()
}
const rowOf = (wrapper, name) => wrapper.findAll('[data-test="ticket-line"]').find((row) => nameOf(row) === name)
const aheadTag = (row) => row.find('[data-test="ticket-line-ahead"]')
const statePill = (row) => row.find('[data-test="ticket-line-state"]')
const UPDATE = "pos_next.api.restaurant.update_item_kds_status"
const ORDER_UPDATE = "pos_next.api.restaurant.update_kds_status"

describe("a dish sent ahead of its course", () => {
	it("wears the small « Ahead » tag until its course is called, and the called dish does not", () => {
		const wrapper = show([dish("Soup", "Starter"), ahead("Steak", "Main"), ahead("Tart", "Dessert", "Pending", CALLED)])

		expect(aheadTag(rowOf(wrapper, "Steak")).text()).toBe("Ahead")
		expect(aheadTag(rowOf(wrapper, "Soup")).exists()).toBe(false)
		expect(aheadTag(rowOf(wrapper, "Tart")).exists()).toBe(false)
	})

	it("says « Ready ahead » in the pill, not the tag, once the kitchen finished it before the call", () => {
		const wrapper = show([dish("Soup", "Starter", "Preparing"), ahead("Steak", "Main", "Ready")])

		const row = rowOf(wrapper, "Steak")
		expect(statePill(row).text()).toBe("Ready ahead")
		expect(aheadTag(row).exists()).toBe(false)
	})

	it("is an ordinary ready dish once the room calls it: « Ready », not « Ready ahead » (the kitchen's view then sends it to the pass)", () => {
		const wrapper = show([dish("Soup", "Starter", "Preparing"), ahead("Steak", "Main", "Ready", CALLED)])

		expect(statePill(rowOf(wrapper, "Steak")).text()).toBe("Ready")
		expect(aheadTag(rowOf(wrapper, "Steak")).exists()).toBe(false)
	})

	it("can be started: its tap opens the menu with « Preparing »", async () => {
		const wrapper = show([dish("Soup", "Starter"), ahead("Steak", "Main")])

		await rowOf(wrapper, "Steak").trigger("click")

		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(true)
		expect(wrapper.text()).toContain("Preparing")
	})

	it("can be finished with « ready », even at a station without a runner, and cannot be delivered before its course is called", async () => {
		const wrapper = show([dish("Soup", "Starter"), ahead("Steak", "Main", "Preparing")], { useRunner: false })

		await rowOf(wrapper, "Steak").trigger("click")

		expect(wrapper.find('[data-test="menu-ready"]').exists()).toBe(true)
		const labels = wrapper.get('[data-test="ticket-line-menu"]').findAll("button").map((button) => button.text())
		expect(labels.some((label) => /deliver|hand over/i.test(label))).toBe(false)
	})

	it("is delivered at a station without a runner as any dish once it is called", async () => {
		const wrapper = show([dish("Soup", "Starter"), ahead("Steak", "Main", "Preparing", CALLED)], { useRunner: false })

		await rowOf(wrapper, "Steak").trigger("click")

		expect(wrapper.find('[data-test="menu-ready"]').exists()).toBe(false)
		const labels = wrapper.get('[data-test="ticket-line-menu"]').findAll("button").map((button) => button.text())
		expect(labels.some((label) => /deliver/i.test(label))).toBe(true)
	})

	it("calls the server to mark it ready, as any dish", async () => {
		const wrapper = show([dish("Soup", "Starter"), ahead("Steak", "Main", "Preparing")])

		await rowOf(wrapper, "Steak").trigger("click")
		await wrapper.get('[data-test="menu-ready"]').trigger("click")

		expect(call).toHaveBeenCalledWith(UPDATE, expect.objectContaining({ item_code: "ITEM-Steak", status: "Ready" }))
	})
})

describe("the order of the meal where the kitchen prepares ahead", () => {
	it("greys no course, whatever the device chose: the later courses are there to start", () => {
		const wrapper = show([dish("Soup", "Starter"), ahead("Steak", "Main"), ahead("Tart", "Dessert")])

		for (const name of ["Soup", "Steak", "Tart"])
			expect(rowOf(wrapper, name).attributes("data-held"), name).toBeUndefined()
	})

	it("is the device's rule again in the room's rhythm: the mains wait for the starters", () => {
		const wrapper = show([dish("Soup", "Starter"), dish("Steak", "Main"), dish("Tart", "Dessert")], {}, "Called by the room")

		expect(rowOf(wrapper, "Steak").attributes("data-held")).toBe("true")
		expect(rowOf(wrapper, "Tart").attributes("data-held")).toBe("true")
	})

	it("is the room's rule when the screen hands down no rhythm at all", () => {
		const wrapper = mount(KDSOrderCard, {
			props: {
				order: {
					name: "SINV-NORHYTHM",
					restaurant_table: "T1",
					table_display_name: "T1",
					kds_status: "Pending",
					creation: "2026-11-01 17:55:00",
					modified: "2026-11-01 18:00:00",
					items: [dish("Soup", "Starter"), dish("Steak", "Main")],
				},
				showStationBadge: false,
				courseOrder: true,
			},
			attachTo: document.body,
			global: { mocks: { __: globalThis.__ } },
		})
		opened.push(wrapper)

		expect(rowOf(wrapper, "Steak").attributes("data-held")).toBe("true")
	})
})

describe("the timer of a ticket with dishes sent ahead", () => {
	const timer = (wrapper) => wrapper.get('[data-test="ticket-timer"]')

	it("counts from the call of the course at the kitchen, not from the dishes waiting for theirs", () => {
		const wrapper = show([
			dish("Soup", "Starter", "Delivered"),
			ahead("Steak", "Main", "Preparing", CALLED),
			ahead("Tart", "Dessert"),
		])

		expect(timer(wrapper).text()).toBe("20:00")
	})

	it("counts from the call even when the kitchen had finished the dish long before", () => {
		const wrapper = show([dish("Soup", "Starter", "Delivered"), ahead("Steak", "Main", "Ready", CALLED)])

		expect(timer(wrapper).text()).toBe("20:00")
	})

	it("does not run for a ticket whose only live dishes are waiting for their call: no number, no late colour", () => {
		const wrapper = show([dish("Soup", "Starter", "Delivered"), ahead("Steak", "Main"), ahead("Tart", "Dessert", "Preparing")])

		expect(timer(wrapper).text()).toBe("")
		expect(timer(wrapper).classes().join(" ")).not.toMatch(/red|orange|animate/)
	})

	it("turns late like any ticket once the course called has waited long enough", () => {
		const wrapper = show([dish("Soup", "Starter", "Delivered"), ahead("Steak", "Main", "Pending", "2026-11-01 18:30:00")])

		expect(timer(wrapper).classes().join(" ")).toContain("red")
	})
})

describe("the main button of a ticket with dishes sent ahead", () => {
	it("has none when the only live dishes were sent ahead and not called: a pill says the ticket waits for the call", () => {
		const wrapper = show([dish("Soup", "Starter", "Delivered"), ahead("Steak", "Main")])

		expect(wrapper.find('[data-test="ticket-main"]').exists()).toBe(false)
		expect(wrapper.get('[data-test="ticket-no-dish"]').text()).toBe("Ahead, waiting for the call")
	})

	it("starts the dishes that are called and leaves the ones sent ahead alone", async () => {
		const wrapper = show([dish("Soup", "Starter", "Pending"), ahead("Steak", "Main"), ahead("Tart", "Dessert")])

		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await Promise.resolve()

		const started = call.mock.calls.filter(([method]) => method === UPDATE).map(([, args]) => args.item_code)
		expect(started).toEqual(["ITEM-Soup"])
		expect(call.mock.calls.some(([method]) => method === ORDER_UPDATE)).toBe(false)
	})

	it("does not take the dish finished ahead for what the ticket waits on: the called dishes decide", () => {
		const wrapper = show([dish("Soup", "Starter", "Preparing"), ahead("Steak", "Main", "Ready")])

		expect(wrapper.get('[data-test="ticket-main"]').text()).toMatch(/ready/i)
	})

	it("is the ordinary button, and the ordinary order-level call, when no dish was sent ahead", async () => {
		const wrapper = show([dish("Soup", "Starter"), dish("Salad", "Starter")], {}, "Called by the room")

		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await Promise.resolve()

		expect(call.mock.calls.some(([method]) => method === ORDER_UPDATE)).toBe(true)
	})
})

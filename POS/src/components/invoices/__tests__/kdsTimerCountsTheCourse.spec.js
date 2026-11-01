/**
 * //// Neoffice — added file (no upstream equivalent). The timer at the head of a kitchen ticket counts from the course at the kitchen (NeoRestau lot 1, Daniel, 01.11: the starters and
 * //// the mains are struck through, the desserts have just been sent, and the ticket still read « 3 h 03 », the time since the table sat down). The ticket reads the time each dish left.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("frappe-ui", () => ({
	createResource: vi.fn(),
	Button: { template: "<button><slot /></button>" },
}))
vi.mock("@/utils/offline/translationCache", () => ({ translationCache: {} }))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => ({ status: "success" })) }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ runnerEnabled: true }),
}))

let KDSOrderCard
beforeAll(async () => {
	const { translate } = await import("@/utils/translation")
	globalThis.__ = translate
	;({ default: KDSOrderCard } = await import("../KDSOrderCard.vue"))
})

const SAT_DOWN = "2026-11-01 11:55:00"
const STARTERS = "2026-11-01 12:00:00"
const MAINS = "2026-11-01 12:40:00"
const DESSERTS = "2026-11-01 14:55:00"

beforeEach(() => {
	window.translatedMessages = {}
	// 15:03: three hours and eight minutes after the table sat down, eight minutes after the desserts left
	vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
	vi.setSystemTime(new Date("2026-11-01T15:03:00"))
})

let opened = []
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	opened = []
	vi.useRealTimers()
})

function dish(name, status, sentAt, extra = {}) {
	return {
		item_code: name,
		item_name: name,
		qty: 1,
		kds_status: status,
		kds_sent_at: sentAt,
		preparation_station: "kit",
		...extra,
	}
}

function show(items, order = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: {
			order: {
				name: "SINV-TIMER",
				restaurant_table: "T1",
				table_display_name: "T1",
				kds_status: "Preparing",
				creation: SAT_DOWN,
				modified: "2026-11-01 14:56:00",
				items,
				...order,
			},
			showStationBadge: false,
		},
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const timer = (wrapper) => wrapper.get('[data-test="ticket-timer"]')

describe("the timer of a ticket whose desserts have just been sent", () => {
	it("reads the time since the desserts left, not the time since the table sat down", () => {
		const wrapper = show([
			dish("Soup", "Delivered", STARTERS),
			dish("Steak", "Delivered", MAINS),
			dish("Tart", "Pending", DESSERTS),
		])

		expect(timer(wrapper).text()).toBe("08:00")
	})

	it("turns red when the course at the kitchen is late, not when the meal is long", () => {
		const late = show([dish("Steak", "Delivered", MAINS), dish("Tart", "Pending", "2026-11-01 14:40:00")])
		const fresh = show([dish("Steak", "Delivered", MAINS), dish("Tart", "Pending", DESSERTS)])

		expect(timer(late).classes().join(" ")).toMatch(/red/)
		expect(timer(fresh).classes().join(" ")).not.toMatch(/red/)
	})

	it("keeps counting from the last change when the dishes carry no time (a ticket sent before this existed)", () => {
		const wrapper = show([dish("Tart", "Pending", null)])

		expect(timer(wrapper).text()).toBe("07:00")
	})

	it("still counts the whole meal in the total time", () => {
		const wrapper = show([dish("Steak", "Delivered", MAINS), dish("Tart", "Pending", DESSERTS)])

		expect(wrapper.get('[data-test="ticket-total-time"]').text()).toBe("3 h 08")
	})
})

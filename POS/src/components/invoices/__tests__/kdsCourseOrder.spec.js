/**
 * //// Neoffice — added file (no upstream equivalent). The order of the meal on a kitchen ticket (NeoResto lot 1, Daniel, 01.11): « on peut prendre un objet ou tous les objets concernant le groupe », « on commence évidemment
 * //// par les entrées, on ne peut pas lancer les plats si on n'a pas fait les entrées », « quand les entrées sont finies, qu'elles sont toutes barrées, on peut réduire la partie entrée […] un chevron ». The card is mounted for real.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { nextTick } from "vue"
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
beforeAll(async () => {
	globalThis.__ = (text, args) => (args ? text.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : text)
	;({ default: KDSOrderCard } = await import("../KDSOrderCard.vue"))
})
beforeEach(() => {
	call.mockClear()
	window.innerWidth = 1280
	window.innerHeight = 800
	window.localStorage.clear()
})

let opened = []
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	opened = []
})

const dish = (name, family, status = "Pending", extra = {}) => ({
	item_code: `ITEM-${name}`,
	item_name: name,
	qty: 1,
	kds_status: status,
	service_family: family,
	kds_batch: 1,
	preparation_station: "kit",
	...extra,
})
function show(items, props = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: {
			order: {
				name: "SINV-COURSES",
				restaurant_table: "T1",
				table_display_name: "T1",
				kds_status: "Pending",
				creation: "2026-10-30 12:00:00",
				modified: "2026-10-30 12:05:00",
				items,
			},
			showStationBadge: false,
			...props,
		},
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
// The dish's own name: without the pill the card writes before it when the dish is not at the ticket's own state
const nameOf = (row) => {
	const copy = row.get('[data-test="ticket-dish-name"]').element.cloneNode(true)
	for (const pill of copy.querySelectorAll('[data-test="ticket-line-state"], [data-test="ticket-station-tag"], [data-test="ticket-line-sent"]')) pill.remove()
	return copy.textContent.trim()
}
const rowOf = (wrapper, name) =>
	wrapper.findAll('[data-test="ticket-line"]').find((row) => nameOf(row) === name)
const sectionOf = (wrapper, label) =>
	wrapper.findAll('[data-test="ticket-section"]').find((header) => header.get("span").text() === label)
const meal = () => [
	dish("Soup", "Starter"),
	dish("Salad", "Starter"),
	dish("Pâté", "Starter"),
	dish("Steak", "Main"),
	dish("Tart", "Dessert"),
]
const UPDATE = "pos_next.api.restaurant.update_item_kds_status"

describe("a course that waits for the one before it", () => {
	it("greys the mains and the desserts while a starter is still to cook, and the starters stay available", () => {
		const wrapper = show(meal())

		for (const name of ["Steak", "Tart"]) {
			const row = rowOf(wrapper, name)
			expect(row.attributes("data-held"), name).toBe("true")
			expect(row.classes(), name).toContain("opacity-50")
			//// a dish that waits can be started ahead (Daniel, 03.11): it is greyed, and it is a touch target
			expect(row.classes(), name).toContain("cursor-pointer")
		}
		for (const name of ["Soup", "Salad", "Pâté"])
			expect(rowOf(wrapper, name).attributes("data-held"), name).toBeUndefined()
	})

	// The words of a menu's buttons, without the cross that closes it
	const menuWords = (wrapper) =>
		wrapper
			.get('[data-test="ticket-line-menu"]')
			.findAll("button")
			.map((button) => button.text())
			.filter(Boolean)

	it("opens a menu on a dish that waits, which offers only to start it (Daniel, 03.11: « démarrer la suite sans avoir livré le premier truc »)", async () => {
		const wrapper = show(meal())

		await rowOf(wrapper, "Steak").trigger("click")
		expect(menuWords(wrapper)).toEqual(["Preparing"])

		await wrapper.get('[data-test="ticket-line-menu"] .border-blue-300').trigger("click")
		expect(call).toHaveBeenCalledWith(UPDATE, expect.objectContaining({ item_code: "ITEM-Steak", status: "Preparing" }))
		// The dish stays greyed: it still waits for its turn, it is only begun
		expect(rowOf(wrapper, "Steak").attributes("data-held")).toBe("true")
	})

	it("draws the menu of a dish with the ink outline of the design system, so that it stands out from the ticket under it (Daniel, 03.11)", async () => {
		const wrapper = show(meal())

		await rowOf(wrapper, "Steak").trigger("click")
		const classes = wrapper.get('[data-test="ticket-line-menu"]').classes()
		expect(classes).toContain("border-2")
		expect(classes).toContain("border-[#141414]")
		expect(classes).toContain("dark:border-white")
	})

	it("opens a menu on a dish that does not wait, with the way on as well", async () => {
		const wrapper = show(meal())

		await rowOf(wrapper, "Soup").trigger("click")
		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="menu-ready"]').exists()).toBe(true)
	})

	it("offers nothing but to take the start back on a dish that waits and is begun, and says it is being prepared", async () => {
		const wrapper = show([dish("Soup", "Starter", "Preparing"), dish("Steak", "Main", "Preparing"), dish("Tart", "Dessert")])
		const steak = rowOf(wrapper, "Steak")

		// Grey says « not its turn »; the word says it is being cooked all the same
		expect(steak.get('[data-test="ticket-line-state"]').text()).toBe("Preparing")
		// The starter is at the ticket's own state: it says nothing
		expect(rowOf(wrapper, "Soup").find('[data-test="ticket-line-state"]').exists()).toBe(false)
		// The dessert waits and nobody began it: its grey says so, it wears no word (Daniel, 03.11)
		expect(rowOf(wrapper, "Tart").find('[data-test="ticket-line-state"]').exists()).toBe(false)

		await steak.trigger("click")
		expect(wrapper.find('[data-test="menu-ready"]').exists()).toBe(false)
		expect(menuWords(wrapper)).toHaveLength(1)
		expect(menuWords(wrapper)[0]).not.toBe("Preparing")
	})

	it("opens no menu on a dish that waits and is already ready: nothing is left to do on it", async () => {
		const wrapper = show([dish("Soup", "Starter"), dish("Steak", "Main", "Ready")])

		await rowOf(wrapper, "Steak").trigger("click")
		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(false)
	})

	it("lets the mains go once every starter is ready", () => {
		const wrapper = show([
			dish("Soup", "Starter", "Ready"),
			dish("Salad", "Starter", "Delivered"),
			dish("Steak", "Main"),
			dish("Tart", "Dessert"),
		])

		expect(rowOf(wrapper, "Steak").attributes("data-held")).toBeUndefined()
		expect(rowOf(wrapper, "Tart").attributes("data-held")).toBe("true")
	})

	it("holds nothing when the screen does not follow the order of the meal", () => {
		const wrapper = show(meal(), { courseOrder: false })

		expect(wrapper.findAll('[data-held="true"]')).toHaveLength(0)
	})

	it("is the rule of a device unless the card is told otherwise: on by default, off when the device chose so", () => {
		expect(show(meal()).findAll('[data-held="true"]').length).toBeGreaterThan(0)
	})

	it("mutes the label of a course that waits, and a press on it offers only to start its dishes", async () => {
		const wrapper = show(meal())
		const mains = sectionOf(wrapper, "Mains")

		expect(mains.attributes("data-held")).toBe("true")
		expect(mains.attributes("data-selectable")).toBe("true")
		await mains.trigger("click")
		expect(wrapper.find('[data-test="section-menu"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="section-preparing"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="section-ready"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="section-delivered"]').exists()).toBe(false)
	})

	it("closes the menu of a course with the same big cross as a dish's (Daniel, 03.11)", async () => {
		const wrapper = show(meal())

		await sectionOf(wrapper, "Mains").trigger("click")
		const cross = wrapper.get('[data-test="section-menu"] [data-test="menu-close"]')

		expect(cross.classes()).toEqual(expect.arrayContaining(["h-16", "w-16", "border-2", "border-[#141414]"]))
	})

	it("cannot press the label of a course that waits when none of its dishes is to start", async () => {
		const wrapper = show([dish("Soup", "Starter"), dish("Steak", "Main", "Preparing")])
		const mains = sectionOf(wrapper, "Mains")

		expect(mains.attributes("data-selectable")).toBeUndefined()
		await mains.trigger("click")
		expect(wrapper.find('[data-test="section-menu"]').exists()).toBe(false)
	})
})

describe("taking a whole course at once", () => {
	it("makes the label of a course that can be taken a button that says how many dishes it holds", () => {
		const wrapper = show(meal())
		const starters = sectionOf(wrapper, "Starters")

		expect(starters.attributes("data-selectable")).toBe("true")
		expect(starters.get('[data-test="ticket-section-count"]').text()).toBe("3")
	})

	it("offers « preparing » and « ready » for the starters, and starts all three with one press", async () => {
		const wrapper = show(meal())

		await sectionOf(wrapper, "Starters").trigger("click")
		const menu = wrapper.get('[data-test="section-menu"]')
		expect(menu.get('[data-test="section-menu-title"]').text()).toBe("Starters · 3")
		expect(menu.findAll('button:not([data-test="menu-close"])').map((b) => b.text())).toEqual([
			"Preparing",
			"Mark ready",
		])

		await wrapper.get('[data-test="section-preparing"]').trigger("click")
		await nextTick()

		expect(call.mock.calls.map(([method, params]) => [method, params.item_code, params.status])).toEqual([
			[UPDATE, "ITEM-Soup", "Preparing"],
			[UPDATE, "ITEM-Salad", "Preparing"],
			[UPDATE, "ITEM-Pâté", "Preparing"],
		])
		// the mains stay where they were: they wait for the starters
		expect(wrapper.find('[data-test="section-menu"]').exists()).toBe(false)
		expect(rowOf(wrapper, "Steak").attributes("data-held")).toBe("true")
	})

	it("marks all the starters ready with one press, and then the mains are free", async () => {
		const wrapper = show(meal(), { useRunner: true })

		await sectionOf(wrapper, "Starters").trigger("click")
		await wrapper.get('[data-test="section-ready"]').trigger("click")
		await nextTick()

		expect(call.mock.calls.map(([, params]) => [params.item_code, params.status])).toEqual([
			["ITEM-Soup", "Ready"],
			["ITEM-Salad", "Ready"],
			["ITEM-Pâté", "Ready"],
		])
		expect(rowOf(wrapper, "Steak").attributes("data-held")).toBeUndefined()
	})

	it("offers « deliver » and no « ready » to a kitchen where the cook delivers", async () => {
		const wrapper = show(meal(), { useRunner: false })

		await sectionOf(wrapper, "Starters").trigger("click")

		expect(
			wrapper
				.get('[data-test="section-menu"]')
				.findAll('button:not([data-test="menu-close"])')
				.map((b) => b.text()),
		).toEqual(["Preparing", "Deliver"])
	})

	it("leaves out of the press a dish of the course that is already further on", async () => {
		const wrapper = show([
			dish("Soup", "Starter", "Preparing"),
			dish("Salad", "Starter"),
			dish("Steak", "Main"),
		])

		await sectionOf(wrapper, "Starters").trigger("click")
		await wrapper.get('[data-test="section-preparing"]').trigger("click")
		await nextTick()

		expect(call.mock.calls.map(([, params]) => params.item_code)).toEqual(["ITEM-Salad"])
	})

	it("closes the menu with its cross, without acting", async () => {
		const wrapper = show(meal())

		await sectionOf(wrapper, "Starters").trigger("click")
		await wrapper.get('[data-test="section-menu"] [data-test="menu-close"]').trigger("click")

		expect(wrapper.find('[data-test="section-menu"]').exists()).toBe(false)
		expect(call).not.toHaveBeenCalled()
	})

	it("closes a dish's menu when a section's opens, and the other way round", async () => {
		const wrapper = show(meal())

		await rowOf(wrapper, "Soup").trigger("click")
		await sectionOf(wrapper, "Starters").trigger("click")
		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="section-menu"]').exists()).toBe(true)

		await rowOf(wrapper, "Salad").trigger("click")
		expect(wrapper.find('[data-test="section-menu"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(true)
	})
})

describe("the main button while a course waits", () => {
	it("starts the starters only, one call each, and leaves the mains and the desserts alone", async () => {
		const wrapper = show(meal())

		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await nextTick()

		expect(call.mock.calls.every(([method]) => method === UPDATE)).toBe(true)
		expect(call.mock.calls.map(([, params]) => params.item_code).sort()).toEqual(
			["ITEM-Pâté", "ITEM-Salad", "ITEM-Soup"].sort(),
		)
		expect(call.mock.calls.every(([, params]) => params.status === "Preparing")).toBe(true)
	})

	it("is the order-level call it always was when nothing waits", async () => {
		const wrapper = show(meal(), { courseOrder: false })

		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await nextTick()

		expect(call).toHaveBeenCalledWith("pos_next.api.restaurant.update_kds_status", {
			invoice_name: "SINV-COURSES",
			status: "Preparing",
		})
	})
})

describe("a course all done folds into one line (Daniel, 01.11: « un chevron sur ce qui était déjà terminé »)", () => {
	const afterStarters = () => [
		dish("Soup", "Starter", "Delivered"),
		dish("Salad", "Starter", "Delivered"),
		dish("Steak", "Main"),
		dish("Tart", "Dessert"),
	]

	it("shows the starters as ONE line with a chevron, the label and how many, and not their dishes", () => {
		const wrapper = show(afterStarters())

		const fold = wrapper.get('[data-test="ticket-finished-group"]')
		expect(fold.text()).toContain("Starters")
		expect(fold.text()).toContain("2")
		expect(fold.attributes("aria-expanded")).toBe("false")
		expect(rowOf(wrapper, "Soup")).toBeUndefined()
		expect(rowOf(wrapper, "Salad")).toBeUndefined()
		// what follows is what the ticket is about
		expect(rowOf(wrapper, "Steak")).toBeDefined()
	})

	it("shows the dishes again, struck through, on a press, and folds them back on the next", async () => {
		const wrapper = show(afterStarters())

		await wrapper.get('[data-test="ticket-finished-group"]').trigger("click")

		expect(wrapper.get('[data-test="ticket-finished-group"]').attributes("aria-expanded")).toBe("true")
		for (const name of ["Soup", "Salad"]) expect(rowOf(wrapper, name).classes(), name).toContain("line-through")

		await wrapper.get('[data-test="ticket-finished-group"]').trigger("click")

		expect(rowOf(wrapper, "Soup")).toBeUndefined()
		expect(wrapper.get('[data-test="ticket-finished-group"]').attributes("aria-expanded")).toBe("false")
	})

	it("does not fold a course that still has a dish to cook: its finished dishes stay struck at the end of the send", () => {
		const wrapper = show([
			dish("Soup", "Starter", "Delivered"),
			dish("Salad", "Starter"),
			dish("Steak", "Main"),
		])

		expect(wrapper.find('[data-test="ticket-finished-group"]').exists()).toBe(false)
		expect(rowOf(wrapper, "Soup").classes()).toContain("line-through")
	})

	it("does not fold the finished dishes of a dish with no course", () => {
		const wrapper = show([dish("Gum", "", "Delivered"), dish("Salad", "Starter")])

		expect(wrapper.find('[data-test="ticket-finished-group"]').exists()).toBe(false)
		expect(rowOf(wrapper, "Gum").classes()).toContain("line-through")
	})

	it("frees the mains the moment the starters are all done", () => {
		const wrapper = show(afterStarters())

		expect(rowOf(wrapper, "Steak").attributes("data-held")).toBeUndefined()
		expect(rowOf(wrapper, "Tart").attributes("data-held")).toBe("true")
	})
})

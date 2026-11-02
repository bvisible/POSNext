/**
 * //// Neoffice — added file (no upstream equivalent). Three kinds of text on a kitchen dish (NeoResto lot 1, task 38a-1, ruling 123):
 * //// OPTIONS in ink with an arrow, a REMARK or instruction in the accent with the "i", an ALLERGY in the one red, bold, in a tinted strip
 * //// of its own with a warning mark. All three the size of the dish's own text, never lighter than the ink at 80 %. The information is as
 * //// important as the dish; it was pale grey, small, and any annotation was red. What makes a remark an allergy is a list of words.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))
const restaurantStore = vi.hoisted(() => ({
	runnerEnabled: false,
	restaurantSettings: {},
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

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue")

let opened = []
beforeEach(() => {
	restaurantStore.restaurantSettings = {}
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	opened = []
})

const modifiers = (...names) =>
	JSON.stringify([{ options: names.map((name) => ({ name })) }])
function dish(extra = {}) {
	return {
		item_code: "STEAK",
		item_name: "Steak",
		qty: 1,
		kds_status: "Preparing",
		kds_batch: 1,
		...extra,
	}
}
function show(...dishes) {
	const wrapper = mount(KDSOrderCard, {
		props: {
			order: {
				name: "SINV-KINDS",
				restaurant_table: "T1",
				table_display_name: "T1",
				kds_status: "Preparing",
				creation: "2026-10-30 12:00:00",
				modified: "2026-10-30 12:05:00",
				items: dishes,
			},
			showStationBadge: false,
		},
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const get = (wrapper, name) => wrapper.get(`[data-test="${name}"]`)
const has = (wrapper, name) => wrapper.find(`[data-test="${name}"]`).exists()

describe("the options of a dish", () => {
	it("are in ink, in regular weight, with an arrow: « → Saignant, Sans sel »", () => {
		const wrapper = show(
			dish({ posa_item_modifiers: modifiers("Saignant", "Sans sel") }),
		)

		const options = get(wrapper, "ticket-options")
		expect(options.text()).toBe("→ Saignant, Sans sel")
		expect(options.classes()).toEqual(
			expect.arrayContaining(["font-normal", "text-gray-900"]),
		)
		// Not the pale grey they had
		expect(options.classes()).not.toContain("text-gray-400")
	})

	it("show nothing when a dish has none, or its JSON cannot be read", () => {
		expect(has(show(dish()), "ticket-options")).toBe(false)
		expect(
			has(show(dish({ posa_item_modifiers: "not json" })), "ticket-options"),
		).toBe(false)
	})
})

describe("a remark or instruction", () => {
	it("is in the accent, medium weight, with the « i » mark", () => {
		const wrapper = show(
			dish({
				posa_special_instructions: "Servir en même temps que la table 4",
			}),
		)

		const remark = get(wrapper, "ticket-remark")
		expect(remark.text()).toBe("Servir en même temps que la table 4")
		expect(remark.classes()).toEqual(
			expect.arrayContaining(["font-medium", "text-blue-700"]),
		)
		expect(remark.find('[data-icon="info"]').exists()).toBe(true)
		// It is not an allergy: no strip, no red
		expect(has(wrapper, "ticket-allergy")).toBe(false)
		expect(remark.classes().join(" ")).not.toMatch(/red/)
	})

	it("shares a line with the options of the dish while they fit", () => {
		const wrapper = show(
			dish({
				posa_item_modifiers: modifiers("Saignant"),
				posa_special_instructions: "Bien chaud",
			}),
		)

		const sub = get(wrapper, "ticket-sub")
		expect(sub.element.contains(get(wrapper, "ticket-options").element)).toBe(
			true,
		)
		expect(sub.element.contains(get(wrapper, "ticket-remark").element)).toBe(
			true,
		)
	})
})

describe("an allergy", () => {
	it("is a remark that holds a word of the list: the one red, bold, in a tinted strip, with the warning mark", () => {
		const wrapper = show(
			dish({ posa_special_instructions: "Allergie : arachides, noix" }),
		)

		const allergy = get(wrapper, "ticket-allergy")
		expect(allergy.text()).toBe("Allergie : arachides, noix")
		expect(allergy.classes()).toEqual(
			expect.arrayContaining([
				"font-bold",
				"bg-red-50",
				"text-red-700",
				"border-l-4",
				"border-red-500",
				// In dark the pale red of the design system's dark ramp, on the tint the till's remap gives `bg-red-50`
				"dark:text-ds-danger-soft",
			]),
		)
		expect(allergy.find('[data-icon="warning"]').exists()).toBe(true)
		// It is not drawn as a remark too
		expect(has(wrapper, "ticket-remark")).toBe(false)
	})

	it("has a strip of its own, never on the line of the options", () => {
		const wrapper = show(
			dish({
				posa_item_modifiers: modifiers("À point"),
				posa_special_instructions: "Intolérance au lactose : pas de beurre",
			}),
		)

		const sub = get(wrapper, "ticket-sub")
		const allergy = get(wrapper, "ticket-allergy")
		expect(sub.element.contains(allergy.element)).toBe(false)
		expect(sub.text()).toBe("→ À point")
	})

	it("is found whatever the case and the accents of the remark", () => {
		for (const remark of [
			"INTOLERANCE AU GLUTEN",
			"allergie aux crustacés",
			"Cœliaque : aucune panure",
		]) {
			expect(
				has(
					show(dish({ posa_special_instructions: remark })),
					"ticket-allergy",
				),
				remark,
			).toBe(true)
		}
	})
})

describe("the restaurant's own list of words", () => {
	it("replaces the default one when its settings carry `allergy_words`", () => {
		restaurantStore.restaurantSettings = { allergy_words: "chocolat, kiwi" }

		expect(
			has(
				show(dish({ posa_special_instructions: "Sans chocolat" })),
				"ticket-allergy",
			),
		).toBe(true)
		// A word of the default list does not make an allergy any more
		const plain = show(dish({ posa_special_instructions: "Allergie aux noix" }))
		expect(has(plain, "ticket-allergy")).toBe(false)
		expect(has(plain, "ticket-remark")).toBe(true)
	})

	it("is the default list when the restaurant's settings say nothing", () => {
		restaurantStore.restaurantSettings = { enable_runner: true }

		expect(
			has(
				show(dish({ posa_special_instructions: "Allergie aux noix" })),
				"ticket-allergy",
			),
		).toBe(true)
	})
})

describe("the three kinds together", () => {
	it("are the size of the dish's own text, set by the size chosen, and the same for all three", () => {
		const wrapper = show(
			dish({
				posa_item_modifiers: modifiers("Saignant"),
				posa_special_instructions: "Bien chaud",
			}),
			dish({
				item_code: "FISH",
				posa_special_instructions: "Allergie : lactose",
			}),
		)

		const sizes = [
			get(wrapper, "ticket-sub"),
			get(wrapper, "ticket-allergy"),
		].map((element) =>
			element
				.classes()
				.find((name) => name.startsWith("text-[length:var(--kds-fs-sub")),
		)
		expect(sizes[0]).toBeTruthy()
		expect(sizes[1]).toBe(sizes[0])
	})

	it("are never truncated: a long remark wraps in full", () => {
		const long = `Allergie : ${"arachides et noix, ".repeat(12)}`
		const wrapper = show(dish({ posa_special_instructions: long }))

		expect(get(wrapper, "ticket-allergy").text()).toBe(long.trim())
		expect(get(wrapper, "ticket-allergy").html()).not.toMatch(
			/truncate|line-clamp|ellipsis/,
		)
	})

	it("keep red for allergies alone: nothing else in the dishes is red", () => {
		const wrapper = show(
			dish({
				posa_item_modifiers: modifiers("Saignant"),
				posa_special_instructions: "Bien chaud",
			}),
		)

		expect(get(wrapper, "ticket-body").html()).not.toMatch(
			/\bred-|text-red|bg-red/,
		)
	})
})

/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen test of 01.11 afternoon (NeoResto lot 1): the menu of a dish is much bigger, with a cross to
 * //// close it and a way back for a dish being prepared (« Annuler le démarrage »), the selected dish is read from across the pass, and a ticket with no dish left
 * //// to cook stays on the screen with a quiet pill instead of a button (« Chez le runner », « La suite à venir »). The French comes from the real catalogue.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { mount } from "@vue/test-utils"
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

const CATALOGUE = path.resolve(__dirname, "../../../../../pos_next/locale/fr.po")

function readCatalogue(file) {
	const unquote = (text) =>
		text.replace(/\\(["\\nt])/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c))
	const messages = {}
	let entry = {}
	let field = null
	const flush = () => {
		if (entry.msgid && entry.msgstr)
			messages[entry.msgctxt ? `${entry.msgid}:${entry.msgctxt}` : entry.msgid] = entry.msgstr
		entry = {}
		field = null
	}
	for (const line of readFileSync(file, "utf8").split("\n")) {
		if (line.startsWith("#~")) continue
		const start = line.match(/^(msgctxt|msgid|msgstr) "(.*)"$/)
		if (start) {
			const [, name, text] = start
			if (name === "msgctxt" || (name === "msgid" && "msgstr" in entry)) flush()
			entry[name] = unquote(text)
			field = name
			continue
		}
		const more = line.match(/^"(.*)"$/)
		if (more && field) entry[field] += unquote(more[1])
		else if (!line.trim()) flush()
	}
	flush()
	return messages
}
const catalogue = readCatalogue(CATALOGUE)

let KDSOrderCard
beforeAll(async () => {
	const { translate } = await import("@/utils/translation")
	globalThis.__ = translate
	;({ default: KDSOrderCard } = await import("../KDSOrderCard.vue"))
})
beforeEach(() => {
	call.mockClear()
	window.translatedMessages = { ...catalogue, Preparing: "bare Preparing", Ready: "bare Ready" }
	window.innerWidth = 1280
	window.innerHeight = 800
})

let opened = []
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	opened = []
})

function ticket(statuses, extra = {}) {
	return {
		name: "SINV-BIG",
		restaurant_table: "T1",
		table_display_name: "T1",
		kds_status: "Preparing",
		creation: "2026-10-30 12:00:00",
		modified: "2026-10-30 12:05:00",
		items: statuses.map((status, index) => ({
			item_code: `ITEM-${index}`,
			item_name: `Dish ${index + 1}`,
			qty: 1,
			kds_status: status,
			kds_batch: 1,
			preparation_station: "kit",
		})),
		...extra,
	}
}
function show(order, props = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: { order, showStationBadge: false, ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const firstLine = (wrapper) => wrapper.get('[data-test="ticket-line"]')
const menu = (wrapper) => wrapper.find('[data-test="ticket-line-menu"]')
const actions = (wrapper) =>
	menu(wrapper)
		.findAll('button:not([data-test="menu-close"])')
		.map((button) => button.text())

describe("the menu of a dish, much bigger (Daniel, 01.11: « même s'il déborde, ce n'est pas grave »)", () => {
	it("is 288 px wide, its buttons 64 px high with words of 20 px, and the dish named in a readable size", async () => {
		const wrapper = show(ticket(["Pending"]))
		await firstLine(wrapper).trigger("click")

		expect(menu(wrapper).classes()).toContain("w-72")
		for (const button of menu(wrapper).findAll('button:not([data-test="menu-close"])')) {
			expect(button.classes()).toContain("min-h-[64px]")
			expect(button.classes()).toContain("text-xl")
		}
		const head = wrapper.get('[data-test="ticket-line-menu-dish"]')
		expect(head.classes()).toContain("text-base")
		expect(head.classes()).toContain("line-clamp-2")
	})

	it("has a cross as big as its buttons, outlined in ink and drawn bold, so that a big finger aims at it and not at the action next to it (Daniel, 03.11)", async () => {
		const wrapper = show(ticket(["Pending"]))
		await firstLine(wrapper).trigger("click")

		const cross = wrapper.get('[data-test="menu-close"]')
		expect(cross.classes()).toEqual(expect.arrayContaining(["h-16", "w-16", "border-2", "border-[#141414]", "rounded-xl"]))
		expect(cross.classes()).toContain("dark:border-white")
		const drawing = cross.get("svg")
		expect(drawing.classes()).toContain("h-9")
		expect(drawing.attributes("stroke-width")).toBe("3")
	})

	it("has a cross at its head that closes it without acting", async () => {
		const wrapper = show(ticket(["Pending"]))
		await firstLine(wrapper).trigger("click")
		expect(menu(wrapper).exists()).toBe(true)

		await wrapper.get('[data-test="menu-close"]').trigger("click")

		expect(menu(wrapper).exists()).toBe(false)
		expect(call).not.toHaveBeenCalled()
		expect(firstLine(wrapper).attributes("data-selected")).toBeUndefined()
	})

	it("marks the selected dish with a heavy ink outline on white, which the tint of its category cannot hide", async () => {
		const wrapper = show(ticket(["Pending"]))
		await firstLine(wrapper).trigger("click")

		const classes = firstLine(wrapper).classes()
		expect(classes).toEqual(
			expect.arrayContaining(["bg-white", "ring-[3px]", "ring-inset", "ring-[#141414]", "shadow-md"]),
		)
	})
})

describe("a way back for a dish being prepared (Daniel, 01.11: « si on veut annuler, on fait comment ? »)", () => {
	it("offers « Annuler le démarrage » to a dish being prepared, after « C'est prêt »", async () => {
		const wrapper = show(ticket(["Preparing"]))
		await firstLine(wrapper).trigger("click")

		expect(actions(wrapper)).toEqual(["C'est prêt", "Annuler le démarrage"])
	})

	it("puts the dish back to « to start » when it is tapped", async () => {
		const wrapper = show(ticket(["Preparing"]))
		await firstLine(wrapper).trigger("click")

		await wrapper.get('[data-test="menu-undo-start"]').trigger("click")

		expect(call).toHaveBeenCalledWith("pos_next.api.restaurant.update_item_kds_status", {
			invoice_name: "SINV-BIG",
			item_code: "ITEM-0",
			status: "Pending",
		})
		expect(menu(wrapper).exists()).toBe(false)
	})

	it("is not offered to a dish that has not been started, nor in the list of what waits at the pass", async () => {
		const pending = show(ticket(["Pending"]))
		await firstLine(pending).trigger("click")
		expect(pending.find('[data-test="menu-undo-start"]').exists()).toBe(false)

		const list = show(ticket(["Ready"]), { mode: "ready-list" })
		await firstLine(list).trigger("click")
		expect(list.find('[data-test="menu-undo-start"]').exists()).toBe(false)
		expect(actions(list)).toEqual(["En préparation"])
	})
})

describe("a ticket the kitchen view keeps with no dish left to cook (Daniel, 01.11: it must not disappear)", () => {
	it("has no button and says « Chez le runner » when all its dishes are with the runner", () => {
		const wrapper = show(
			ticket(["Delivered", "Delivered"], { view_state: "at-the-pass" }),
		)

		expect(wrapper.find('[data-test="ticket-main"]').exists()).toBe(false)
		expect(wrapper.get('[data-test="ticket-no-dish"]').text()).toBe("Chez le runner")
	})

	it("says « À remettre » on a takeaway, where nothing goes to a runner", () => {
		const wrapper = show(
			ticket(["Delivered"], { view_state: "at-the-pass", is_takeaway: 1 }),
		)

		expect(wrapper.get('[data-test="ticket-no-dish"]').text()).toBe("À remettre")
	})

	it("says « La suite à venir » when its starters are done and its mains are held back", () => {
		const wrapper = show(
			ticket(["Delivered", "Waiting"], { view_state: "next-course" }),
		)

		expect(wrapper.find('[data-test="ticket-main"]').exists()).toBe(false)
		expect(wrapper.get('[data-test="ticket-no-dish"]').text()).toBe("La suite à venir")
	})

	it("keeps its dishes on the ticket, struck through", () => {
		const wrapper = show(
			ticket(["Delivered", "Delivered"], { view_state: "at-the-pass" }),
		)

		expect(wrapper.findAll('[data-test="ticket-line-done"]')).toHaveLength(2)
	})

	it("has no pill when a dish is still to cook", () => {
		const wrapper = show(ticket(["Preparing", "Pending"]))

		expect(wrapper.find('[data-test="ticket-no-dish"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="ticket-main"]').exists()).toBe(true)
	})
})

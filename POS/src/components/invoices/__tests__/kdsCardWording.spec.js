/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen card says ACTIONS on its buttons and STATES on its badges
 * //// (NeoRestau lot 1, task 38a-1, ruling 113). The French comes from the real catalogue (pos_next/locale/fr.po) through the
 * //// real translate(), and the bare words are given other values, so that the card can only read right through the contexts
 * //// « Kitchen action » and « Kitchen order status ». A cook taps « Commencer », then « C'est prêt »; what is ready at the
 * //// pass is « À livrer »; a takeaway is « Remettre ».
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { mount } from "@vue/test-utils"
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: false }))

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
	useRestaurantStore: () => restaurantStore,
}))

const CATALOGUE = path.resolve(
	__dirname,
	"../../../../../pos_next/locale/fr.po",
)

function readCatalogue(file) {
	const unquote = (text) =>
		text.replace(/\\(["\\nt])/g, (_, c) =>
			c === "n" ? "\n" : c === "t" ? "\t" : c,
		)
	const messages = {}
	let entry = {}
	let field = null
	const flush = () => {
		if (entry.msgid && entry.msgstr) {
			messages[
				entry.msgctxt ? `${entry.msgid}:${entry.msgctxt}` : entry.msgid
			] = entry.msgstr
		}
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
	window.translatedMessages = {
		...catalogue,
		Start: "bare Start",
		Ready: "bare Ready",
		Delivered: "bare Delivered",
		Deliver: "bare Deliver",
		Preparing: "bare Preparing",
	}
})

let opened = []
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	opened = []
})

function ticket(statuses, extra = {}) {
	return {
		name: "SINV-WORDS",
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
const mainButton = (wrapper) =>
	wrapper.get('[data-test="ticket-actions"] button').text()
const pills = (wrapper) =>
	wrapper.findAll('[data-test="ticket-line-state"]').map((pill) => pill.text())

describe("the main button of a kitchen card says the action", () => {
	it("is Commencer on a ticket to start, C'est prêt on a ticket being cooked, and Livrer on a ticket that is ready", () => {
		expect(mainButton(show(ticket(["Pending", "Pending"])))).toBe("Commencer")
		expect(mainButton(show(ticket(["Preparing", "Pending"])))).toBe(
			"C'est prêt",
		)
		expect(mainButton(show(ticket(["Ready", "Ready"])))).toBe("Livrer")
	})

	it("is Remettre on a takeaway that is ready, and the other two buttons do not change", () => {
		const takeaway = { is_takeaway: 1, takeaway_number: "T-001" }
		expect(mainButton(show(ticket(["Ready"], takeaway)))).toBe("Remettre")
		expect(mainButton(show(ticket(["Pending"], takeaway)))).toBe("Commencer")
		expect(mainButton(show(ticket(["Preparing"], takeaway)))).toBe("C'est prêt")
	})
})

describe("the badges of a kitchen card say the state", () => {
	it("read En attente and À livrer on the dishes that are not at the ticket's own state, and À remettre on a takeaway's", () => {
		// The ticket is in preparation: a dish being prepared says nothing, the others say where they are (task 38a-1)
		expect(pills(show(ticket(["Pending", "Preparing", "Ready"])))).toEqual([
			"En attente",
			"À livrer",
		])
		// A takeaway that is ready says so where the states mix (placement A), and a dish at the pass of a takeaway in preparation reads À remettre
		expect(
			show(ticket(["Ready"], { is_takeaway: 1 }), { showState: true })
				.get('[data-test="ticket-status"]')
				.text(),
		).toBe("À remettre")
		expect(
			pills(show(ticket(["Preparing", "Ready"], { is_takeaway: 1 }))),
		).toEqual(["À remettre"])
	})

	it("never put the word of a button on a badge: C'est prêt and Livrer are not states", () => {
		const text = show(ticket(["Pending", "Preparing", "Ready"]))
			.findAll('[data-test="ticket-line-state"]')
			.map((pill) => pill.text())
			.join(" ")
		expect(text).not.toMatch(/C'est prêt|Livrer|Commencer/)
	})
})

describe("the menu of a dish says where the dish goes", () => {
	const menuOf = async (wrapper) => {
		await wrapper.get('[data-test="ticket-line"]').trigger("click")
		return wrapper
			.get('[data-test="ticket-line-menu"]')
			.findAll('button:not([data-test="menu-close"])')
			.map((button) => button.text())
	}

	it("offers En préparation and C'est prêt to a dish still to start when a runner carries the dishes on", async () => {
		expect(await menuOf(show(ticket(["Pending"])))).toEqual([
			"En préparation",
			"C'est prêt",
		])
	})

	it("offers En préparation and Livrer when the cook delivers, and Remettre on a takeaway", async () => {
		expect(await menuOf(show(ticket(["Pending"]), { useRunner: false }))).toEqual(
			["En préparation", "Livrer"],
		)
		expect(
			await menuOf(show(ticket(["Pending"], { is_takeaway: 1 }), { useRunner: false })),
		).toEqual(["En préparation", "Remettre"])
	})
})

/**
 * //// Neoffice — added file (no upstream equivalent). The labels NeoRestau lot 1 task 9 corrects reach their screens:
 * //// the "Plan" view of the pass and of the reservation form reads "Plan de salle", a kitchen status reads in French
 * //// wherever one is shown, each through a context of its own so that no common word is changed for the whole site,
 * //// and the permanent card, which the system names, reads "Articles permanents" wherever its name is displayed.
 * ////
 * //// The French comes from the real catalogue (pos_next/locale/fr.po), keyed the way Frappe keys it (the msgid, or
 * //// "msgid:context"), and goes through the real translate(). The bare words (Plan, Pending, Preparing, Ready,
 * //// Delivered) are given a different value here, so that a screen can only read the right French if it asks for the
 * //// word under its context.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { flushPromises, mount } from "@vue/test-utils"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const restaurantStore = vi.hoisted(() => ({}))
const call = vi.hoisted(() => vi.fn(async () => ({})))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: {
		template: "<div><slot name='body-content' /><slot name='actions' /></div>",
	},
	FeatherIcon: { template: "<i />" },
	Input: { template: "<input />" },
	createResource: vi.fn(),
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useReservations", () => ({
	useReservations: () => ({
		createReservation: vi.fn(),
		checkAvailability: vi.fn(async () => ({ conflicts: [] })),
	}),
}))
vi.mock("@/utils/offline/translationCache", () => ({ translationCache: {} }))
vi.mock("@/socket", () => ({ initSocket: () => null }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		handleError: vi.fn(),
	}),
}))
vi.mock("@/utils/draftManager", () => ({
	clearAllDrafts: vi.fn(),
	deleteDraft: vi.fn(),
	getAllDrafts: vi.fn(async () => [
		draft("D-1", "Pending"),
		draft("D-2", "Preparing"),
		draft("D-3", "Ready"),
		draft("D-4", "Delivered"),
	]),
}))
vi.mock("@/utils/printInvoice", () => ({ printInvoiceCustom: vi.fn() }))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({}) }))
vi.mock("@/stores/posCart", () => ({
	usePOSCartStore: () => ({ currentDraftId: null }),
}))
vi.mock("@/stores/posDrafts", () => ({
	usePOSDraftsStore: () => ({ returnDraftSerials: vi.fn() }),
}))

function draft(id, status) {
	return {
		draft_id: id,
		customer: "Walk-in",
		created_at: "2026-10-30T10:00:00",
		items: [],
		restaurant_table: "t4b1e",
		kds_status: status,
	}
}

const CATALOGUE = path.resolve(__dirname, "../../../pos_next/locale/fr.po")
const PLAN = "Floor plan view"
const KITCHEN = "Kitchen order status"
const STATUSES = {
	Pending: "En attente",
	Preparing: "En préparation",
	Ready: "Prêt",
	Delivered: "Livré",
}

/** The catalogue as the till is handed it: msgid -> French, and "msgid:context" -> French for a word in a context. */
function readCatalogue(path) {
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
	for (const line of readFileSync(path, "utf8").split("\n")) {
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
// What the screens may only get right through the context: the bare words say something else
const messages = {
	...catalogue,
	Plan: "bare Plan",
	...Object.fromEntries(
		Object.keys(STATUSES).map((word) => [word, `bare ${word}`]),
	),
}

let kitchenStatusLabel
let cardLabel
let Runner
let DraftInvoicesDialog
let KDSOrderCard
let ReservationForm
let CardEditor
let MenuSettings

beforeAll(async () => {
	const { translate } = await import("@/utils/translation")
	globalThis.__ = translate
	;({ kitchenStatusLabel } = await import("@/utils/kitchenStatus"))
	;({ cardLabel } = await import("@/utils/cardLabel"))
	;({ default: Runner } = await import("@/pages/Runner.vue"))
	;({ default: DraftInvoicesDialog } = await import(
		"@/components/sale/DraftInvoicesDialog.vue"
	))
	;({ default: KDSOrderCard } = await import(
		"@/components/invoices/KDSOrderCard.vue"
	))
	;({ default: ReservationForm } = await import(
		"@/components/restaurant/ReservationForm.vue"
	))
	;({ default: CardEditor } = await import(
		"@/components/restaurant/CardEditor.vue"
	))
	;({ default: MenuSettings } = await import(
		"@/components/restaurant/MenuSettings.vue"
	))
})

beforeEach(() => {
	window.translatedMessages = messages
	call.mockReset()
	call.mockImplementation(async () => ({}))
	Object.assign(restaurantStore, {
		runnerEnabled: true,
		isEnabled: true,
		tillRestaurant: "The Bistro",
		ofTheRestaurant: () => ({ restaurant: "The Bistro" }),
		tableLabel: () => "T1",
		fetchRestaurantSettings: vi.fn(async () => {}),
	})
})

const mountWith = (component, options = {}) =>
	mount(component, {
		...options,
		global: { mocks: { __: globalThis.__ }, ...options.global },
	})

describe("the catalogue", () => {
	it("holds the pass's plan view and the four kitchen statuses, each under its context", () => {
		expect(catalogue[`Plan:${PLAN}`]).toBe("Plan de salle")
		for (const [status, french] of Object.entries(STATUSES)) {
			expect(catalogue[`${status}:${KITCHEN}`]).toBe(french)
		}
	})

	it("does not touch the bare words, which the whole site shares", () => {
		expect(catalogue.Plan).toBe("Plan")
		expect(catalogue.Pending).toBe("En attente")
		expect(catalogue.Preparing).toBe("En préparation")
		expect(catalogue.Ready).toBe("Prêt")
		expect(catalogue.Delivered).toBe("Livré")
		expect(catalogue["Permanent items"]).toBe("Articles permanents")
	})
})

describe("the plan view", () => {
	it("reads Plan de salle on the pass, and the other two views keep their words", async () => {
		const wrapper = mountWith(Runner, {
			global: { stubs: { RunnerOrderCard: true } },
		})
		await flushPromises()

		const views = wrapper
			.findAll("button")
			.map((button) => button.text())
			.filter((text) =>
				["Par table", "Par poste", "Plan de salle", "bare Plan"].includes(text),
			)
		expect(views).toEqual(["Par table", "Par poste", "Plan de salle"])
	})

	it("reads Plan de salle on the toggle of the reservation form too, and List stays List", async () => {
		const tables = [
			{ name: "t4b1e", table_name: "T1", area: "r00m", pos_x: 10, pos_y: 20 },
		]
		const wrapper = mountWith(ReservationForm, {
			props: { tables },
			global: { stubs: { ReservationFloorPlan: true } },
		})
		await flushPromises()

		const toggle = wrapper.find(".btn-plan-toggle")
		expect(toggle.text()).toBe("Plan de salle")
		await toggle.trigger("click")
		expect(toggle.text()).toBe(messages.List ?? "List")
	})
})

describe("a kitchen status", () => {
	it("is French, whichever of the four it is", () => {
		for (const [status, french] of Object.entries(STATUSES)) {
			expect(kitchenStatusLabel(status)).toBe(french)
		}
	})

	it("leaves another status to its own word, and shows nothing for none", () => {
		expect(kitchenStatusLabel("Waiting")).toBe(catalogue.Waiting)
		expect(kitchenStatusLabel(undefined)).toBe("")
		expect(kitchenStatusLabel(null)).toBe("")
		expect(kitchenStatusLabel("")).toBe("")
	})

	it("is French on a held order of the draft list, which used to show the stored English word", async () => {
		const wrapper = mountWith(DraftInvoicesDialog, {
			props: { modelValue: true },
		})
		await flushPromises()

		const badges = wrapper
			.findAll("span")
			.filter((span) => span.text().startsWith("KDS:"))
		expect(badges.map((badge) => badge.text())).toEqual([
			"KDS: En attente",
			"KDS: En préparation",
			"KDS: Prêt",
			"KDS: Livré",
		])
	})

	it("is French on the kitchen display, on the order and on its dishes", async () => {
		const order = {
			name: "SINV-0001",
			creation: "2026-10-30 10:00:00",
			kds_status: "Preparing",
			restaurant_table: "t4b1e",
			items: [
				{
					name: "r1",
					item_code: "SOUP",
					item_name: "Soup",
					qty: 1,
					kds_status: "Ready",
					kds_batch: 1,
				},
				{
					name: "r2",
					item_code: "STEAK",
					item_name: "Steak",
					qty: 2,
					kds_status: "Pending",
					kds_batch: 1,
				},
			],
		}
		const wrapper = mountWith(KDSOrderCard, { props: { order } })
		await flushPromises()

		const text = wrapper.text()
		expect(text).toContain("En préparation")
		expect(text).toContain("Prêt")
		expect(text).toContain("En attente")
		expect(text).not.toMatch(/Preparing|Pending/)
	})
})

describe("the permanent card", () => {
	// The names the server gives it (get_or_create_permanent_card): the free one, then the restaurant's, then a number
	const NAMED_BY_THE_SYSTEM = [
		"Permanent items",
		"Permanent items - The Bistro",
		"Permanent items 2",
		"Permanent items - The Bistro 2",
	]
	const PERMANENT = {
		name: "Permanent items",
		card_name: "Permanent items",
		is_active: 1,
		is_permanent: 1,
	}
	const LUNCH = {
		name: "Lunch",
		card_name: "Lunch",
		is_active: 1,
		is_permanent: 0,
	}

	it("reads Articles permanents under any name the system gave it", () => {
		for (const card_name of NAMED_BY_THE_SYSTEM) {
			expect(cardLabel({ card_name, is_permanent: 1 })).toBe(
				"Articles permanents",
			)
		}
	})

	it("keeps the name a person gave it, and the name of every other card", () => {
		expect(cardLabel({ card_name: "Weekend lunch", is_permanent: 1 })).toBe(
			"Weekend lunch",
		)
		expect(
			cardLabel({ card_name: "Permanent items for lunch", is_permanent: 1 }),
		).toBe("Permanent items for lunch")
		// A card that is not the permanent one is never relabelled, whatever it is called
		expect(cardLabel({ card_name: "Permanent items", is_permanent: 0 })).toBe(
			"Permanent items",
		)
		expect(cardLabel({ card_name: "Lunch", is_permanent: 0 })).toBe("Lunch")
		expect(cardLabel(null)).toBe("")
		expect(cardLabel(undefined)).toBe("")
	})

	it("reads Articles permanents in the heading of the card editor, and the name it is stored under stays", async () => {
		call.mockImplementation(async (method, params) => {
			if (method.endsWith("get_restaurant_cards")) return [LUNCH, PERMANENT]
			if (method === "frappe.client.get")
				return { ...PERMANENT, name: params.name, items: [] }
			return null
		})
		const wrapper = mountWith(CardEditor, {
			props: { modelValue: true },
			global: {
				stubs: {
					CreateItemDialog: true,
					ItemEditPanel: true,
					MenuDesignerDialog: true,
				},
			},
		})
		await flushPromises()

		await wrapper
			.findAll("div")
			.find((el) => el.text() === "Articles permanents")
			.trigger("click")
		await flushPromises()

		const heading = wrapper.find("h3")
		expect(heading.text()).toBe("Articles permanents")
		// Renaming starts from the name the card is stored under: the label is only how it is shown
		await heading.trigger("click")
		expect(wrapper.find("input.font-bold").element.value).toBe(
			"Permanent items",
		)
		expect(wrapper.vm.cardDetail.card_name).toBe("Permanent items")
	})

	it("reads Articles permanents among the cards of the menu designer", () => {
		const wrapper = mountWith(MenuSettings, {
			props: { cards: [LUNCH, PERMANENT], cardName: "Lunch" },
		})

		const labels = wrapper.findAll("label").map((label) => label.text())
		expect(labels).toContain("Lunch")
		expect(labels).toContain("Articles permanents")
		expect(labels).not.toContain("Permanent items")
	})
})

describe("the sources", () => {
	const sources = import.meta.glob("/src/**/*.vue", {
		query: "?raw",
		import: "default",
		eager: true,
	})

	it("show a kitchen status only through kitchenStatusLabel", () => {
		// A bare __(item.kds_status) asks for the word every app shares; a raw {{ draft.kds_status }} is the stored English
		const bare = /__\(\s*[\w.$]*kds_?[sS]tatus\b[^)]*\)/
		const raw = /\{\{\s*[\w.$]*kds_?[sS]tatus\s*\}\}/
		const offenders = Object.entries(sources)
			.filter(([, source]) => bare.test(source) || raw.test(source))
			.map(([path]) => path)
		expect(offenders).toEqual([])
	})

	it("ask for the plan view under its context, never as the bare word", () => {
		const bare = /__\(\s*["']Plan["']\s*\)/
		const offenders = Object.entries(sources)
			.filter(([, source]) => bare.test(source))
			.map(([path]) => path)
		expect(offenders).toEqual([])
	})

	it("show the permanent card by its label wherever the cards of a restaurant are listed", () => {
		// The till's card tabs and the designer's list print every card, the permanent one included; the settings lists
		// ask for the selectable cards only, which leave it out
		const stored = /\{\{\s*(card|cardDetail)\.card_name\s*\}\}/
		const printsTheStoredName = (file) => stored.test(sources[`/src/${file}`])
		expect(printsTheStoredName("pages/POSSale.vue")).toBe(false)
		expect(printsTheStoredName("components/restaurant/MenuSettings.vue")).toBe(
			false,
		)
		const editor = sources["/src/components/restaurant/CardEditor.vue"]
		expect(editor).toMatch(/\{\{\s*cardLabel\(cardDetail\)\s*\}\}/)
		expect(editor).toMatch(/:card-display-name="cardLabel\(cardDetail\)"/)
	})

	it("ask for the plan view and the statuses under the contexts the catalogue holds", () => {
		const asked = (context) =>
			Object.values(sources).filter(
				(source) =>
					source.includes(`"${context}"`) || source.includes(`'${context}'`),
			)
		expect(asked(PLAN).length).toBeGreaterThan(0)
		// One literal call per word, which is what the catalogue extraction reads (written as a pattern here, so that this
		// file feeds the catalogue with nothing)
		const helper = readFileSync(
			path.resolve(__dirname, "../utils/kitchenStatus.js"),
			"utf8",
		)
		for (const status of Object.keys(STATUSES)) {
			expect(helper).toMatch(
				new RegExp(
					`case "${status}":\\s*return __\\(\\s*"${status}",\\s*null,\\s*"${KITCHEN}"\\)`,
				),
			)
		}
	})
})

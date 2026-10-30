/**
 * //// Neoffice — added file (no upstream equivalent). The labels NeoRestau lot 1 task 9 corrects reach their screens:
 * //// the pass's "Plan" view reads "Plan de salle", and a kitchen status reads in French wherever one is shown,
 * //// each through a context of its own so that no common word is changed for the whole site.
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

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: {
		template: "<div><slot name='body-content' /><slot name='actions' /></div>",
	},
	FeatherIcon: { template: "<i />" },
	createResource: vi.fn(),
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => ({})) }))
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
let Runner
let DraftInvoicesDialog
let KDSOrderCard

beforeAll(async () => {
	const { translate } = await import("@/utils/translation")
	globalThis.__ = translate
	;({ kitchenStatusLabel } = await import("@/utils/kitchenStatus"))
	;({ default: Runner } = await import("@/pages/Runner.vue"))
	;({ default: DraftInvoicesDialog } = await import(
		"@/components/sale/DraftInvoicesDialog.vue"
	))
	;({ default: KDSOrderCard } = await import(
		"@/components/invoices/KDSOrderCard.vue"
	))
})

beforeEach(() => {
	window.translatedMessages = messages
	Object.assign(restaurantStore, {
		runnerEnabled: true,
		isEnabled: true,
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

describe("the pass's plan view", () => {
	it("reads Plan de salle and the other two views keep their words", async () => {
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

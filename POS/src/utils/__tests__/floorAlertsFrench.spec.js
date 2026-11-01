/**
 * //// Neoffice — added file (no upstream equivalent). The floor alerts in French (NeoRestau lot 1, Daniel, 01.11): the product owner speaks French, and everything a person reads (the notice on the till, its buttons,
 * //// the group of the till's settings, the warnings of « View table ») goes through the real catalogue (pos_next/locale/fr.po) and the real `translate`. The template (main.pot) carries each new string, empty.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { mount } from "@vue/test-utils"
import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("frappe-ui", () => ({ createResource: vi.fn(), Button: { template: "<button><slot /></button>" } }))
vi.mock("@/utils/offline/translationCache", () => ({ translationCache: {} }))
vi.mock("@/utils/alertSoundPlayer", () => ({ previewAlertSound: vi.fn(async () => true) }))

const ROOT = path.resolve(__dirname, "../../../../pos_next")

/** The catalogue as the till is handed it: msgid -> French. `keepEmpty` keeps the entries that say nothing yet (a template). */
function readCatalogue(file, { keepEmpty = false } = {}) {
	const unquote = (text) => text.replace(/\\(["\\nt])/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c))
	const messages = {}
	let entry = {}
	let field = null
	const flush = () => {
		if (entry.msgid && !entry.msgctxt && (entry.msgstr || keepEmpty)) messages[entry.msgid] = entry.msgstr
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
const catalogue = readCatalogue(path.join(ROOT, "locale/fr.po"))
const template = readCatalogue(path.join(ROOT, "locale/main.pot"), { keepEmpty: true })

const placeholders = (text) => (text.match(/\{\d+\}/g) || []).sort().join(",")

// Every string of the floor alerts a person reads
const STRINGS = [
	"{0} — the guest is ordering",
	"{0} — order to validate",
	"{0} — {1} orders to validate",
	"{0} — the guest has paid",
	"{0} — the guest has paid part of the bill",
	"{0} × {1}",
	"Table {0}",
	"View table",
	"Guest order sound",
	"Send or finish the order in progress before opening another table",
	"This table could not be found",
	"This table could not be opened",
	"Floor alerts",
	"Popup when a guest orders",
	"Show a notice at the top of the till when a guest orders or pays from the QR code of a table",
	"Seconds the notice stays on the till. 0 = until somebody dismisses it. An order waiting for the waiter to validate it always stays until it is handled or dismissed",
	"Sound of the till when a guest orders or pays from the QR code of a table. It plays at the alert volume set above",
	"Listen to the sound",
]
// Words the notices share with the rest of the till, already in the catalogue
const SHARED = ["Dismiss", "Dismiss: {0}", "+{0}", "Listen", "Listen to the sound: {0}", "Touch the screen to enable the sound", "Popup stays (seconds)"]

describe("the floor alerts in the French catalogue", () => {
	it("translates every string a person reads, and none of them is left as the English", () => {
		for (const key of [...STRINGS, ...SHARED]) {
			expect(catalogue[key], key).toBeTruthy()
			if (key !== "+{0}" && key !== "{0} × {1}" && key !== "Table {0}") expect(catalogue[key], key).not.toBe(key)
		}
	})

	it("keeps the placeholders of every message, and no more", () => {
		for (const key of [...STRINGS, ...SHARED]) expect(placeholders(catalogue[key]), key).toBe(placeholders(key))
	})

	it("says what the product owner said: « le client commande », « commande à valider », « Voir la table »", () => {
		expect(catalogue["{0} — the guest is ordering"]).toBe("{0} — le client commande")
		expect(catalogue["{0} — order to validate"]).toBe("{0} — commande à valider")
		expect(catalogue["{0} — {1} orders to validate"]).toBe("{0} — {1} commandes à valider")
		expect(catalogue["{0} — the guest has paid"]).toBe("{0} — le client a payé")
		expect(catalogue["View table"]).toBe("Voir la table")
		expect(catalogue["Floor alerts"]).toBe("Alertes de la salle")
	})

	it("has the template entries for the translators, empty, for each new string", () => {
		for (const key of STRINGS) {
			expect(key in template, key).toBe(true)
			expect(template[key] ?? "", key).toBe("")
		}
	})
})

describe("the screens, read in French", () => {
	let translate
	beforeAll(async () => {
		;({ translate } = await import("@/utils/translation"))
		globalThis.__ = translate
		window.translatedMessages = { ...catalogue }
	})

	it("says the notices of a guest's order, a table to validate and a payment in French, with their buttons", async () => {
		const { default: FloorNotices } = await import("@/components/restaurant/FloorNotices.vue")
		const notice = (table, over) => ({ key: `${table}|1`, kind: "order", table, items: [], count: 0, orders: 1, partial: false, ...over })
		const wrapper = mount(FloorNotices, {
			props: {
				notices: [
					notice("a", { items: [{ item_name: "Verre de vin", qty: 3 }], count: 1 }),
					notice("b", { kind: "pending", orders: 2, count: 2 }),
					notice("c", { kind: "payment" }),
					notice("d", { kind: "payment", partial: true }),
				],
				max: 4,
				labelOf: (table) => ({ a: "T2", b: "Terrasse 4", c: "7", d: "T9" })[table],
			},
			global: { mocks: { __: globalThis.__ } },
		})
		const text = wrapper.text()

		expect(text).toContain("T2 — le client commande")
		expect(text).toContain("3 × Verre de vin")
		expect(text).toContain("Terrasse 4 — 2 commandes à valider")
		expect(text).toContain("Table 7 — le client a payé")
		expect(text).toContain("T9 — le client a payé une partie de l'addition")
		expect(text).toContain("Voir la table")
		expect(text).toContain("Fermer")
	})

	it("says the Listen button of the floor alerts in French", async () => {
		const { default: KitchenAlertListen } = await import("@/components/settings/KitchenAlertListen.vue")
		const wrapper = mount(KitchenAlertListen, { props: { which: "floor" }, global: { mocks: { __: globalThis.__ } } })

		expect(wrapper.text()).toContain("Écouter · Son de la commande du client")
	})
})

/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen alerts in French (NeoRestau lot 1, Daniel, 01.11): the product owner speaks French, and everything a person reads (the notice in the kitchen, the chip that asks
 * //// for a touch, the section of the till's settings, the names of the sounds) goes through the real catalogue (pos_next/locale/fr.po) and the real `translate`. The words of the choices of the desk's POS Settings form
 * //// (the Select options of the doctype) are the same words under no context, which is how the desk looks them up.
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

/** The catalogue as the till is handed it: msgid -> French, and "msgid:context" -> French for a word in a context. `keepEmpty` keeps the entries that say nothing yet (a template). */
function readCatalogue(file, { keepEmpty = false } = {}) {
	const unquote = (text) => text.replace(/\\(["\\nt])/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c))
	const messages = {}
	let entry = {}
	let field = null
	const flush = () => {
		if (entry.msgid && (entry.msgstr || keepEmpty)) messages[entry.msgctxt ? `${entry.msgid}:${entry.msgctxt}` : entry.msgid] = entry.msgstr
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
// A key is "msgid", or "msgid:context" for a word in one of the two contexts of the sounds and volumes
const msgidOf = (key) => key.replace(/:(Alert sound|Alert volume)$/, "")

// Every string of the kitchen alerts a person reads: the key is "msgid" or "msgid:context"
const STRINGS = [
	"Kitchen alerts",
	"Popup when the next course is ordered",
	"Show a notice at the top of the kitchen screen when the next course of a table is ordered",
	"Popup stays (seconds)",
	"Seconds the notice stays on the kitchen screen. 0 = until somebody dismisses it",
	"Next course sound",
	"Sound of the kitchen screen when the next course is ordered",
	"Dishes ready sound",
	"Sound of the runner screen when dishes come up ready",
	"Alert volume",
	"Listen",
	"Listen to the sound: {0}",
	"A tablet plays the sounds once somebody has touched its screen.",
	"This browser cannot play the sound.",
	"{0} — the next course is ordered: {1}",
	"{0} — the next course is ordered",
	"Dismiss",
	"Dismiss: {0}",
	"Touch the screen to enable the sound",
	"Popup stays (seconds) must be between 0 and {0}",
	...["None", "Bell", "Double beep", "Chime", "Gong", "Beep"].map((word) => `${word}:Alert sound`),
	...["Low", "Medium", "High"].map((word) => `${word}:Alert volume`),
	// The Select options of the desk's POS Settings form, looked up under no context
	"Bell",
	"Double beep",
	"Chime",
	"Gong",
	"Beep",
]

describe("the kitchen alerts in the French catalogue", () => {
	it("translates every string a person reads, and none of them is left as the English", () => {
		for (const key of STRINGS) {
			expect(catalogue[key], key).toBeTruthy()
			// A gong is a gong in French
			if (key !== "Gong:Alert sound" && key !== "Gong") expect(catalogue[key], key).not.toBe(msgidOf(key))
		}
	})

	it("keeps the placeholders of every message, and no more", () => {
		for (const key of STRINGS) {
			expect(placeholders(catalogue[key]), key).toBe(placeholders(msgidOf(key)))
		}
	})

	it("speaks to the staff the way the rest of the till does: « vous », and « la suite » for the next course", () => {
		expect(catalogue["Touch the screen to enable the sound"]).toBe("Touchez l'écran pour activer le son")
		expect(catalogue["{0} — the next course is ordered: {1}"]).toBe("{0} — la suite est commandée : {1}")
		expect(catalogue["Next course sound"]).toContain("suite")
	})

	it("has the template entries for the translators, empty, for each new string of the till's own screens", () => {
		for (const key of STRINGS.filter((name) => name !== "Dismiss")) {
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

	it("says the section of the till's settings in French, the sounds and the volumes by their French names", async () => {
		const { default: KitchenAlertsSettings } = await import("@/components/settings/KitchenAlertsSettings.vue")
		const wrapper = mount(KitchenAlertsSettings, { props: {}, global: { mocks: { __: globalThis.__ } } })
		const text = wrapper.text()

		expect(text).toContain("Alertes de la cuisine")
		expect(text).toContain("Écouter")
		expect(text).toContain("Son de la suite")
		expect(text).toContain("Volume des alertes")
		const sounds = wrapper.findAll("[data-test='sound-next-course'] option").map((option) => option.text())
		expect(sounds).toEqual(["Aucun", "Cloche", "Double bip", "Carillon", "Gong", "Bip"])
		const volumes = wrapper.findAll("[data-test='volume'] option").map((option) => option.text())
		expect(volumes).toEqual(["Faible", "Moyen", "Fort"])
		// What is stored is the doctype's English word, whatever the language of the screen
		expect(wrapper.findAll("[data-test='sound-next-course'] option").map((option) => option.element.value)).toEqual([
			"None",
			"Bell",
			"Double beep",
			"Chime",
			"Gong",
			"Beep",
		])
	})

	it("says the notice in the kitchen in French", async () => {
		const { default: NextCourseNotices } = await import("@/components/restaurant/NextCourseNotices.vue")
		const wrapper = mount(NextCourseNotices, {
			props: { notices: [{ key: "A|1", order: "A", table: "Table 12", families: ["Dessert"], count: 1 }] },
			global: { mocks: { __: globalThis.__ } },
		})

		expect(wrapper.text()).toContain("Table 12 — la suite est commandée : Desserts")
		expect(wrapper.text()).toContain("Fermer")
	})
})

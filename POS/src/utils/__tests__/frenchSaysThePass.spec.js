/**
 * //// Neoffice — added file (no upstream equivalent). The French catalogue says « passe », never « Runner » (neoffice-maintenance#2163,
 * //// the restaurant film of 02.11.2026: « Runner » in English on the floor plan, the screens' switch and the pass screen). The screen
 * //// where the cooked dishes wait to be carried is « le passe », the word the catalogue already used (« prêt(s) au passe »,
 * //// « Écran de passe »). The receipt window says the change handed back (« Rendu : … »), in the same catalogue.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "../../../../pos_next")

/** The catalogue as the till is handed it: msgid -> French, and "msgid:context" -> French for a word in a context. */
function readCatalogue(file) {
	const unquote = (text) => text.replace(/\\(["\\nt])/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c))
	const messages = {}
	let entry = {}
	let field = null
	const flush = () => {
		if (entry.msgid && entry.msgstr) messages[entry.msgctxt ? `${entry.msgid}:${entry.msgctxt}` : entry.msgid] = entry.msgstr
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

describe("the French of the pass (neoffice-maintenance#2163)", () => {
	it("says « Runner » nowhere", () => {
		const english = Object.entries(catalogue).filter(([, french]) => /runner/i.test(french))

		expect(english).toEqual([])
	})

	it("names the screen « Passe » where it said « Runner »", () => {
		expect(catalogue["Runner"]).toBe("Passe")
		expect(catalogue["Runner:Restaurant screen"]).toBe("Passe")
		expect(catalogue["Runner Display"]).toBe("Écran de passe")
		expect(catalogue["Runner · {0} ready at the pass"]).toContain("{0}")
	})

	it("says the change handed back in the receipt window", () => {
		expect(catalogue["Change given: {0}"]).toBe("Rendu : {0}")
	})
})

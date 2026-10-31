/**
 * //// Neoffice — added file (no upstream equivalent). Three kinds of text on a kitchen ticket (NeoRestau lot 1, task 38a-1, ruling
 * //// 123): the OPTIONS of a dish, a REMARK or instruction, and an ALLERGY. They look different, so that an allergy cannot be taken for
 * //// a remark. The server stores a remark as free text (`posa_special_instructions`), so what makes it an allergy is a list of WORDS
 * //// (allergie, gluten, lactose...), a default the restaurant can replace by a setting of its own (`allergy_words`).
 */
import { describe, expect, it } from "vitest"
import {
	allergyWordsOf,
	DEFAULT_ALLERGY_WORDS,
	isAllergy,
} from "../kitchenTextKinds"

describe("the default list of words that make a remark an allergy", () => {
	it("holds the words of the ruling and the common allergens", () => {
		for (const word of [
			"allergie",
			"allergy",
			"intolérance",
			"intolerance",
			"gluten",
			"lactose",
			"arachide",
			"noix",
			"crustacés",
		]) {
			expect(isAllergy(`Table 4: ${word}`), word).toBe(true)
		}
	})

	it("is a list a restaurant can read: plain words, none empty", () => {
		expect(DEFAULT_ALLERGY_WORDS.length).toBeGreaterThan(8)
		for (const word of DEFAULT_ALLERGY_WORDS) expect(word.trim()).toBe(word)
		expect(DEFAULT_ALLERGY_WORDS).toContain("allergie")
		expect(DEFAULT_ALLERGY_WORDS).toContain("gluten")
	})
})

describe("a remark that is an allergy", () => {
	it("is one that holds a word of the list, whatever its case and its accents", () => {
		expect(isAllergy("ALLERGIE : arachides, noix")).toBe(true)
		expect(isAllergy("Intolerance au lactose : pas de beurre")).toBe(true)
		expect(isAllergy("intolérance au GLUTEN")).toBe(true)
		expect(isAllergy("Allergie aux CRUSTACES")).toBe(true)
		expect(isAllergy("Cœliaque : aucune panure")).toBe(true)
	})

	it("is found by the word's start, so that plurals and endings count: arachides, crustacés, allergies", () => {
		expect(isAllergy("des arachides")).toBe(true)
		expect(isAllergy("fruits de mer et crustacés")).toBe(true)
		expect(isAllergy("plusieurs allergies")).toBe(true)
	})

	it("is not found in the middle of another word: a word has to begin where the list's word begins", () => {
		// « noix » is not in « renoix » (not a word), and « gluten » not in « stgluten »
		expect(isAllergy("sansgluten")).toBe(false)
		expect(isAllergy("xnoix")).toBe(false)
	})

	it("is not a plain remark: an instruction to the kitchen holds none of the words", () => {
		expect(isAllergy("Servir en même temps que la table 4")).toBe(false)
		expect(isAllergy("Anniversaire : une bougie sur le dessert")).toBe(false)
		expect(isAllergy("Bien chaud")).toBe(false)
	})

	it("is never an empty remark, nor a missing one", () => {
		expect(isAllergy("")).toBe(false)
		expect(isAllergy("   ")).toBe(false)
		expect(isAllergy(undefined)).toBe(false)
		expect(isAllergy(null)).toBe(false)
	})
})

describe("the restaurant's own list", () => {
	it("replaces the default one: a word of its own makes a remark an allergy, and the default words stop doing so", () => {
		const words = ["chocolat", "kiwi"]

		expect(isAllergy("Sans chocolat", words)).toBe(true)
		expect(isAllergy("Kiwi interdit", words)).toBe(true)
		expect(isAllergy("Allergie aux noix", words)).toBe(false)
	})

	it("is read from the restaurant's setting `allergy_words`, as a list or as a text, one word per comma or line", () => {
		expect(allergyWordsOf({ allergy_words: ["Chocolat", " kiwi "] })).toEqual([
			"chocolat",
			"kiwi",
		])
		expect(
			allergyWordsOf({ allergy_words: "chocolat, kiwi\npoisson" }),
		).toEqual(["chocolat", "kiwi", "poisson"])
	})

	it("is the default list when the setting says nothing, or nothing usable", () => {
		expect(allergyWordsOf(undefined)).toEqual(DEFAULT_ALLERGY_WORDS)
		expect(allergyWordsOf({})).toEqual(DEFAULT_ALLERGY_WORDS)
		expect(allergyWordsOf({ allergy_words: "" })).toEqual(DEFAULT_ALLERGY_WORDS)
		expect(allergyWordsOf({ allergy_words: " , \n " })).toEqual(
			DEFAULT_ALLERGY_WORDS,
		)
		expect(allergyWordsOf({ allergy_words: [] })).toEqual(DEFAULT_ALLERGY_WORDS)
		expect(allergyWordsOf({ allergy_words: 3 })).toEqual(DEFAULT_ALLERGY_WORDS)
	})

	it("an empty list never makes every remark an allergy", () => {
		expect(isAllergy("Allergie aux noix", [])).toBe(false)
	})
})

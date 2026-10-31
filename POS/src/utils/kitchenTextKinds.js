//// Neoffice — added file (no upstream equivalent). Three kinds of text on a kitchen ticket (NeoRestau lot 1, task 38a-1, ruling 123): the OPTIONS
//// of a dish (« → Saignant, Sans sel »), a REMARK or instruction (« Servir en même temps que la table 4 »), and an ALLERGY (« Allergie : arachides,
//// noix »). The information on a ticket is as important as the dish, and an allergy is not to be taken for a remark: each kind has its own look
//// (ink, accent, the one red), drawn by the card. What tells an allergy from a remark is here: the server keeps a remark as free text
//// (`posa_special_instructions`), so the card looks for WORDS in it. The list below is the default; a restaurant replaces it with its own,
//// the setting `allergy_words` (a list, or a text with one word per comma or line), when the restaurant's settings carry one.

/**
 * The words that make a remark an allergy, by default: the allergy and the intolerance themselves, and the allergens a kitchen is told about most.
 * A word is looked for by its START (the list says `crustacé`, `crustacés` is found), without regard to case or accents.
 */
export const DEFAULT_ALLERGY_WORDS = [
	"allergie",
	"allergy",
	"allergen",
	"allergène",
	"intolérance",
	"intolerance",
	"gluten",
	"cœliaque",
	"coeliaque",
	"celiac",
	"coeliac",
	"lactose",
	"arachide",
	"peanut",
	"noix",
	"crustacé",
	"shellfish",
]

/** A text in capitals-free, accent-free form: what is compared, so that « Intolérance » and « INTOLERANCE » are the same word. */
function fold(text) {
	return String(text ?? "")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/œ/gi, "oe")
		.toLowerCase()
}

/**
 * The words that make a remark an allergy at a restaurant: its own setting when it has a usable one, else the default.
 *
 * @param {{ allergy_words?: string|string[] }|null|undefined} settings - The restaurant's settings
 * @returns {string[]} The words, trimmed and in lower case (the default list as it is written when the setting says nothing usable)
 */
export function allergyWordsOf(settings) {
	const setting = settings?.allergy_words
	let words = []
	if (Array.isArray(setting)) words = setting
	else if (typeof setting === "string") words = setting.split(/[,\n;]+/)
	words = words.map((word) => String(word).trim().toLowerCase()).filter(Boolean)
	return words.length ? words : DEFAULT_ALLERGY_WORDS
}

/**
 * Whether a remark is an allergy: it holds one of the words, by the word's start, whatever its case and accents.
 *
 * @param {string|null|undefined} remark - The free text of the remark
 * @param {string[]} [words] - The words to look for (the default list when none is given); an empty list finds nothing
 * @returns {boolean}
 */
export function isAllergy(remark, words = DEFAULT_ALLERGY_WORDS) {
	const text = fold(remark).trim()
	if (!text) return false
	return words.some((word) => {
		const needle = fold(word).trim()
		if (!needle) return false
		// At the start of the text or after anything that is not a letter or a digit, so that « sansgluten » is not « gluten »
		const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}`, "u").test(text)
	})
}

//// Neoffice — added file (no upstream equivalent). The short code of a room on a kitchen ticket (NeoRestau lot 1, task
//// 38a-1, ruling 126). A kitchen can feed several rooms, so the line of a ticket opens with the room as a small chip, then
//// the table, which is the big word. The default code is « the letters of the name and the number in it on two digits »:
//// « Salle 1 » is S01, « Salle 2 » is S02. A room with no number takes its first three letters (« Terrasse » is TER) and a
//// takeaway is EMP. The client derives it for now; the server will send its own field with the room (task 38b), editable on
//// the room, and this file stays only as the fallback for a room that has none.

const NUMBER = /\d+/
// A letter of any language, accents and ligatures included: what is left of a name once the digits and the signs are gone
const LETTER = /\p{L}/u

/** Accents folded to the letter under them, and the two ligatures NFD leaves alone (« Cœur » is COE, not COŒ). */
function fold(text) {
	return text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/œ/g, "oe")
		.replace(/Œ/g, "OE")
		.replace(/æ/g, "ae")
		.replace(/Æ/g, "AE")
}

/**
 * The short code of a room, in capitals.
 *
 * - a takeaway: `EMP`
 * - a name with a number: the first letter and the first number on two digits (`Salle 1` is `S01`, `Salle 100` is `S100`)
 * - a name with no number: the first three letters of its first word (`Terrasse` is `TER`)
 * - a name that is only a number: the number on two digits
 * - no name: an empty string, so the ticket draws no chip rather than a guess
 *
 * @param {string|null|undefined} name - The room's display name
 * @param {{ takeaway?: boolean }} [options]
 * @returns {string}
 */
export function roomCode(name, { takeaway = false } = {}) {
	if (takeaway) return "EMP"
	const text = fold(String(name ?? "")).trim()
	if (!text) return ""

	const number = text.match(NUMBER)
	// The letters, in capitals, with the digits and the signs dropped
	const letters = [...text].filter((char) => LETTER.test(char)).join("")
	if (number) {
		const digits = number[0].replace(/^0+(?=\d)/, "").padStart(2, "0")
		return letters ? `${letters[0].toUpperCase()}${digits}` : digits
	}

	// The first word only: « Salle des fêtes » is SAL, not SAL from a mix of words
	const firstWord = text.split(/[^\p{L}]+/u).find(Boolean) ?? ""
	return firstWord.slice(0, 3).toUpperCase()
}

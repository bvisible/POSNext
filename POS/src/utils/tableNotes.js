//// Neoffice — added file (no upstream equivalent). The notes of a table (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): one table can seat several groups (couples, families) that order and pay on their own. A note is a draft
//// order of the table, told apart by its RANK (1, 2, 3…) and, if the waiter wants, by a NAME (« Dupont »). A table with one note stays « Table 5 »; « Table 5.2 » (and « · Dupont ») appears only when the table has a second note.
//// This file is the PURE rule: ranks, names, labels, the pills of the order's header, the keys an order payload carries, the search of the list of tables. The cart, the composables and the cards all go through it, so that none
//// of them can write a table differently from another.

import { normalizeCovers } from "@/utils/coverCounts"

/** The first and the last rank a note can have: the server refuses anything else. */
export const NOTE_MIN = 1
export const NOTE_MAX = 99
/** The longest name of a note (the server keeps 60 characters). */
export const NOTE_NAME_MAX = 60

/**
 * Whether a value is a rank the server takes: a whole number from 1 to 99.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isRank(value) {
	return Number.isInteger(value) && value >= NOTE_MIN && value <= NOTE_MAX
}

/**
 * The rank of a note as the till reads it: a rank, else 1. An order that has no rank (a table with no order, a legacy order stored with 0) is the first note.
 *
 * @param {unknown} value - A number, a numeric string, or whatever the server answered
 * @returns {number} 1 to 99
 */
export function effectiveRank(value) {
	if (value === null || value === undefined || value === "") return NOTE_MIN
	const number = typeof value === "string" ? Number(value.trim()) : value
	return isRank(number) ? number : NOTE_MIN
}

/**
 * The name of a note as it is kept: trimmed, its inner spaces collapsed, at most 60 characters. Anything that is no text is no name.
 *
 * @param {unknown} value
 * @returns {string} "" for none
 */
export function cleanNoteName(value) {
	if (typeof value !== "string") return ""
	return value.replace(/\s+/g, " ").trim().slice(0, NOTE_NAME_MAX).trim()
}

/** « .2 »: the rank as the waiter says it. */
export function rankLabel(rank) {
	return `.${effectiveRank(rank)}`
}

/**
 * The notes the server answered, cleaned: one entry per rank (the first one wins), sorted by rank. An entry that is no object is dropped.
 *
 * @param {unknown} notes - `notes` of open_table / get_table_order
 * @returns {Array<{ name: string|null, note: number, note_name: string|null, covers: number|null, grand_total: number, items_count: number, kds_status: string }>}
 */
export function normalizeNotes(notes) {
	if (!Array.isArray(notes)) return []
	const byRank = new Map()
	for (const entry of notes) {
		if (!entry || typeof entry !== "object") continue
		const rank = effectiveRank(entry.note)
		if (byRank.has(rank)) continue
		byRank.set(rank, {
			name: entry.name || null,
			note: rank,
			note_name: cleanNoteName(entry.note_name) || null,
			covers: normalizeCovers(entry.covers),
			grand_total: Number(entry.grand_total) || 0,
			items_count: Number(entry.items_count) || 0,
			kds_status: entry.kds_status || "",
			// A note only the cart has (not saved yet) stays marked when its list goes through again
			...(entry.pending ? { pending: true } : {}),
		})
	}
	return [...byRank.values()].sort((a, b) => a.note - b.note)
}

/**
 * The notes of the table with the one in front of the waiter added when the server does not have it yet: a new note exists only in the cart until its first « Valider ».
 *
 * @param {unknown} notes - The server's notes
 * @param {unknown} rank - The note in front of the waiter
 * @param {unknown} [name] - Its name
 * @returns {Array<Object>} Sorted by rank; the added entry has `pending: true` and no invoice name
 */
export function withPendingNote(notes, rank, name = "") {
	const list = normalizeNotes(notes)
	const current = effectiveRank(rank)
	if (list.some((note) => note.note === current)) return list
	return [
		...list,
		{
			name: null,
			note: current,
			note_name: cleanNoteName(name) || null,
			covers: null,
			grand_total: 0,
			items_count: 0,
			kds_status: "",
			pending: true,
		},
	].sort((a, b) => a.note - b.note)
}

/**
 * The rank of a new note: the one after the highest the table has, so that a group keeps its number for the whole sitting (a note paid and gone leaves its rank unused, and the groups left are not renumbered). Once the
 * highest rank is the last one possible, the smallest rank not taken.
 *
 * @param {Array<number>} ranks - The ranks the table has (the note in front of the waiter included)
 * @returns {number|null} null when every rank is taken
 */
export function nextFreeRank(ranks) {
	const taken = new Set((ranks || []).map(effectiveRank))
	const highest = Math.max(NOTE_MIN - 1, ...taken)
	if (highest < NOTE_MAX) return highest + 1
	for (let rank = NOTE_MIN; rank <= NOTE_MAX; rank += 1) if (!taken.has(rank)) return rank
	return null
}

/**
 * The words that name a table: « Table 5 » for a table with one note, « Table 5.2 » (and « Dupont » apart) when it has several.
 *
 * @param {string} base - The table's name as the floor writes it
 * @param {{ rank?: unknown, name?: unknown, count?: unknown }} [note] - The note, and how many notes the table has
 * @returns {{ title: string, name: string }} `name` is "" for a note with none (or a table with one note)
 */
export function noteParts(base, { rank, name, count } = {}) {
	const table = String(base ?? "")
	if (!(Number(count) > 1)) return { title: table, name: "" }
	return { title: `${table}.${effectiveRank(rank)}`, name: cleanNoteName(name) }
}

/**
 * « Table 5.2 · Dupont »: the label of a table in one string, for the header and the lists.
 *
 * @param {string} base
 * @param {{ rank?: unknown, name?: unknown, count?: unknown }} [note]
 * @returns {string}
 */
export function tableLabel(base, note) {
	const { title, name } = noteParts(base, note)
	return name ? `${title} · ${name}` : title
}

/**
 * The words that name the table of a kitchen or pass order: its table's name and, when the table has several notes, the note's rank and name. The order says `note`, `note_name` and `notes_count`.
 *
 * @param {{ table_display_name?: string, restaurant_table?: string, note?: unknown, note_name?: unknown, notes_count?: unknown }} order
 * @returns {{ title: string, name: string }}
 */
export function orderTableParts(order) {
	return noteParts(order?.table_display_name || order?.restaurant_table || "", {
		rank: order?.note,
		name: order?.note_name,
		count: order?.notes_count,
	})
}

/**
 * The same, in one string: « Table 5.2 · Dupont ». For a message that names the order's table (the notice of a next course, the undo toast).
 *
 * @param {Object} order - A kitchen or pass order
 * @returns {string}
 */
export function orderTableLabel(order) {
	const { title, name } = orderTableParts(order)
	return name ? `${title} · ${name}` : title
}

/**
 * The pills of the header's row: one per note of the table, sorted by rank, the one in front of the waiter marked and carrying its live figures (what the cart holds now, not what the server last said).
 *
 * @param {unknown} notes - The server's notes (a pending one may be in the list already)
 * @param {{ rank?: unknown, name?: unknown, covers?: unknown, total?: unknown, lines?: unknown }} [current] - The note in front of the waiter
 * @returns {Array<{ rank: number, label: string, name: string, text: string, covers: number|null, total: number, lines: number, invoice: string|null, current: boolean, pending: boolean }>}
 */
export function notePills(notes, current = {}) {
	const rank = effectiveRank(current.rank)
	return withPendingNote(notes, rank, current.name).map((note) => {
		const isCurrent = note.note === rank
		const name = isCurrent ? cleanNoteName(current.name) : note.note_name || ""
		const covers = isCurrent ? normalizeCovers(current.covers) : note.covers
		return {
			rank: note.note,
			label: rankLabel(note.note),
			name,
			text: name ? `${rankLabel(note.note)} ${name}` : rankLabel(note.note),
			covers,
			total: isCurrent ? Number(current.total) || 0 : note.grand_total,
			lines: isCurrent ? Number(current.lines) || 0 : note.items_count,
			invoice: note.name || null,
			current: isCurrent,
			pending: Boolean(note.pending),
		}
	})
}

/**
 * Whether the note in front of the waiter is the lowest open note the server has: the order a guest makes from the table's QR code attaches to it. A note the server does not have yet (a new group) is not.
 *
 * @param {unknown} notes - The server's open notes
 * @param {unknown} rank - The note in front of the waiter
 * @returns {boolean} true when the server has no note at all (the guest's order will make the first one)
 */
export function isTheLowestNote(notes, rank) {
	const list = normalizeNotes(notes)
	return list.length === 0 || effectiveRank(rank) === list[0].note
}

/**
 * What an order payload carries of the note: `restaurant_note` (the rank) when the table has several notes or the note is not the first, so that the order lands on its own note and never on another; nothing for a table
 * with its one first note, which is saved exactly as before. `restaurant_note_name` rides along only when asked (`withName`: the note has no order yet; a name changed later goes through its own call) and only when a name is set.
 *
 * @param {Object} state
 * @param {unknown} state.table - The table of the order (none: a counter sale or a takeaway, nothing to carry)
 * @param {unknown} state.rank - The note in front of the waiter
 * @param {unknown} [state.name] - Its name
 * @param {unknown} [state.notes] - The server's notes
 * @param {boolean} [state.withName] - Carry the name too
 * @returns {{ restaurant_note?: number, restaurant_note_name?: string }}
 */
export function notePayload({ table, rank, name, notes, withName = false }) {
	if (!table) return {}
	const current = effectiveRank(rank)
	if (current === NOTE_MIN && withPendingNote(notes, current).length < 2) return {}
	const payload = { restaurant_note: current }
	const label = cleanNoteName(name)
	if (withName && label) payload.restaurant_note_name = label
	return payload
}

/**
 * What the floor's list says of the notes of a table: how many it has and the names the waiter gave them. The aggregated summary of the table's order carries `notes_count` and `note_names`.
 *
 * @param {{ order_summary?: { notes_count?: unknown, note_names?: unknown }|null, notes_count?: unknown, note_names?: unknown }} table
 * @returns {{ count: number, names: string[] }} `count` is 0 for a table with no order
 */
export function tableNotesInfo(table) {
	const summary = table?.order_summary || {}
	const count = Number(summary.notes_count ?? table?.notes_count)
	const names = summary.note_names ?? table?.note_names
	return {
		count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
		names: Array.isArray(names) ? names.map(cleanNoteName).filter(Boolean) : [],
	}
}

// Capitals and accents tell nothing when someone types a name on a till
const fold = (text) =>
	String(text ?? "")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.trim()

/**
 * Whether a table answers a search: the words it holds (its label, its name, the names of its notes) contain every word typed, whatever the capitals and accents.
 *
 * @param {{ table_name?: string, name?: string, order_summary?: Object|null }} table
 * @param {unknown} query - What was typed; an empty search keeps every table
 * @returns {boolean}
 */
export function tableMatchesSearch(table, query) {
	const words = fold(query).split(/\s+/).filter(Boolean)
	if (words.length === 0) return true
	const { names } = tableNotesInfo(table)
	const haystack = fold([table?.table_name, table?.name, ...names].join(" "))
	return words.every((word) => haystack.includes(word))
}

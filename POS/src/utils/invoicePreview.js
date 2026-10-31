// //// Neoffice — added file (no upstream equivalent).
/**
 * What a row of the invoice history says about its ticket (NeoRestau lot 1, task 29).
 *
 * « 2× Pizza Margherita · 1× Coca-Cola 33 cl · 1× Tiramisu », then « +2 items » when the ticket has more
 * dishes than the three shown: one sees at a glance what a sale or a table's order was, and the eye icon of the
 * row stays the way to see everything. No price: the amount of the row says it.
 *
 * The server sends the first three dishes (`items_preview`, each `{item_name, qty, uom}` where `uom` is the
 * line's unit only when it is not the item's own unit, as the cart says it) and the number of dishes
 * (`items_count`; the restaurant's tip line is no dish). A row held on the device (an offline sale, or a row cached
 * before the server sent a preview) carries its lines itself (`items`, or `data.items` in the offline queue) and
 * gets the same preview from them.
 *
 * Each dish is drawn on its own (components/sale/InvoiceTicketPreview.vue) so that a dish is shown whole or not at
 * all; `fittingLines` says how many the room of two lines holds, and the « +n » counts the rest.
 */
import { useFormatters } from "@/composables/useFormatters";

/** Lines shown in a preview; the rest is only counted. */
export const PREVIEW_LINES = 3;

/**
 * Longest name handed to the row, the ellipsis included: a bound on what is drawn, not the cut the eye sees (each
 * dish is cut by the width of its column, with an ellipsis, by the stylesheet); the whole name stays in the tooltip.
 */
export const PREVIEW_NAME_MAX = 60;

/** Lines of text a preview may take in a row. */
export const PREVIEW_MAX_LINES = 2;

const SEPARATOR = " · ";

const { formatQuantity } = useFormatters();

// A name is cut by user-perceived characters, never through a surrogate pair (an emoji) or a joined sequence
const segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

function characters(text) {
	return segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
}

/**
 * Cut a name to `max` characters with an ellipsis, never leaving a space before it.
 * @param {string|null|undefined} name
 * @param {number} max
 * @returns {string}
 */
export function truncateName(name, max = PREVIEW_NAME_MAX) {
	const text = String(name ?? "").trim();
	// Fewer UTF-16 units than the limit: fewer characters too
	if (text.length <= max) return text;
	const chars = characters(text);
	if (chars.length <= max) return text;
	return `${chars.slice(0, Math.max(0, max - 1)).join("").trimEnd()}…`;
}

/** One line as the preview needs it, from a server line or from a local cart / queue line. */
function normalize(line) {
	const quantity = line.qty ?? line.quantity;
	// The server already leaves out the item's own unit; a local line names both, so the rule is applied here
	const unit = line.uom && line.uom !== line.stock_uom ? line.uom : null;
	return {
		name: String(line.item_name || line.item_code || line.name || "").trim(),
		quantity: formatQuantity(quantity),
		unit,
	};
}

/** « 2× Pizza » — or « 0.75 Litre Wine » when the unit is not the item's own. */
function label({ name, quantity, unit }, shown) {
	return unit ? `${quantity} ${unit} ${shown}` : `${quantity}× ${shown}`;
}

/** The lines a row speaks of, and how many dishes the ticket holds. */
function source(invoice) {
	if (Array.isArray(invoice?.items_preview)) {
		const lines = invoice.items_preview;
		const count = Number.parseInt(invoice.items_count, 10);
		return { lines, count: Number.isNaN(count) ? lines.length : count };
	}
	const local = [invoice?.items, invoice?.data?.items].find((lines) => Array.isArray(lines) && lines.length);
	return { lines: local ?? [], count: local?.length ?? 0 };
}

/**
 * The preview of a row.
 * @param {Object|null} invoice - a row of the history (server row, cached row or offline sale)
 * @returns {{lines: {text: string, title: string}[], text: string, title: string, hidden: number}} `lines`: the
 *   dishes to draw, names cut (`text`) and whole (`title`); `text` and `title`: the same joined, for a tooltip or a
 *   reader of the text; `hidden`: dishes the ticket holds beyond those handed over. `lines` is empty for a ticket
 *   with no dish: the row shows nothing then.
 */
export function invoicePreview(invoice) {
	const { lines, count } = source(invoice);
	const taken = lines.slice(0, PREVIEW_LINES);
	const shown = taken.map(normalize).filter((line) => line.name);
	if (!shown.length) return { lines: [], text: "", title: "", hidden: 0 };
	const dishes = shown.map((line) => ({ text: label(line, truncateName(line.name)), title: label(line, line.name) }));
	return {
		lines: dishes,
		text: dishes.map((dish) => dish.text).join(SEPARATOR),
		title: dishes.map((dish) => dish.title).join(SEPARATOR),
		hidden: Math.max(0, count - taken.length),
	};
}

/**
 * How many dishes, taken in order, the room of `maxLines` lines holds: `tops` are the vertical positions of the
 * dishes as laid out (offsetTop), dishes on one line sharing theirs. A dish that wrapped under the last line is
 * not shown, nor any after it.
 * @param {number[]} tops
 * @param {number} maxLines
 * @param {number} tolerance - pixels two tops may differ by and still be one line
 * @returns {number}
 */
export function fittingLines(tops, maxLines = PREVIEW_MAX_LINES, tolerance = 2) {
	const lineTops = [];
	let fitting = 0;
	for (const top of tops) {
		if (!lineTops.some((seen) => Math.abs(seen - top) <= tolerance)) {
			if (lineTops.length >= maxLines) break;
			lineTops.push(top);
		}
		fitting += 1;
	}
	return fitting;
}

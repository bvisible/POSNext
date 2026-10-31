// //// Neoffice — added file (no upstream equivalent).
/**
 * What a row of the invoice history says about its ticket (NeoRestau lot 1, task 29).
 *
 * « 2× Pizza Margherita · 1× Coca-Cola 33 cl · 1× Tiramisu », then « +2 articles » when the ticket has more
 * lines than the three shown: one sees at a glance what a sale or a table's order was, and the eye icon of the
 * row stays the way to see everything. No price: the amount of the row says it.
 *
 * The server sends the first three lines (`items_preview`, each `{item_name, qty, uom}` where `uom` is the
 * line's unit only when it is not the item's own unit, as the cart says it) and the number of lines
 * (`items_count`). A row held on the device (an offline sale, or a row cached before the server sent a preview)
 * carries its lines itself (`items`, or `data.items` in the offline queue) and gets the same preview from them.
 */
import { useFormatters } from "@/composables/useFormatters";

/** Lines shown in a preview; the rest is only counted. */
export const PREVIEW_LINES = 3;

/** Longest name shown, the ellipsis included; the whole name stays in the tooltip. */
export const PREVIEW_NAME_MAX = 36;

const SEPARATOR = " · ";

const { formatQuantity } = useFormatters();

/**
 * Cut a name to `max` characters with an ellipsis, never leaving a space before it.
 * @param {string|null|undefined} name
 * @param {number} max
 * @returns {string}
 */
export function truncateName(name, max = PREVIEW_NAME_MAX) {
	const text = String(name ?? "").trim();
	if (text.length <= max) return text;
	return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
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

/** The lines a row speaks of, and how many the ticket holds. */
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
 * @returns {{text: string, title: string, hidden: number}} `text`: the shown lines, names cut; `title`: the
 *   same with the whole names, for the tooltip; `hidden`: lines the ticket holds beyond those shown. `text`
 *   is empty for a ticket with no line: the row shows nothing then.
 */
export function invoicePreview(invoice) {
	const { lines, count } = source(invoice);
	const taken = lines.slice(0, PREVIEW_LINES);
	const shown = taken.map(normalize).filter((line) => line.name);
	if (!shown.length) return { text: "", title: "", hidden: 0 };
	return {
		text: shown.map((line) => label(line, truncateName(line.name))).join(SEPARATOR),
		title: shown.map((line) => label(line, line.name)).join(SEPARATOR),
		hidden: Math.max(0, count - taken.length),
	};
}

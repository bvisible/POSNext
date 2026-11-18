//// Neoffice — added file (no upstream equivalent). The title of a package reaches the till as the site stored it, escaped for a page (« Coupe &amp; Brushing »): the till draws text, not
//// markup, so Vue escapes it a second time and the cashier read « &amp; » (NeoSalon lots G11, the audit of 18.11, voie 4). Decoded once, here, where the answer comes in.
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è", agrave: "à", ecirc: "ê", ccedil: "ç" };

/** The text an escaped one says: `&amp;` → `&`, `&#233;` → `é`. One pass, so `&amp;lt;` reads `&lt;`. */
export function plainText(text) {
	return String(text ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
		if (entity[0] === "#") {
			const code = entity[1].toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
		}
		return NAMED[entity.toLowerCase()] ?? whole;
	});
}

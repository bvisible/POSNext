//// Neoffice — added file (no upstream equivalent). The line a package of the customer pays when the cashier presses « Use » on its banner (NeoSalon, lots G11, voie 1; the board
//// « Use a package at the till »): the line the cashier chose in the cart when that package can pay it, else the first service line it covers that nothing pays yet. The site decides
//// what it accepts; this only picks the line to ask about, and says no line when none can be asked about (the button is then greyed).
import { covers } from "@/stores/customerPackages";

const sessionsOf = (row) => Math.max(1, Math.trunc(Number(row?.quantity ?? row?.qty) || 1));

/** The sessions of a package that the lines of the cart already take, the line `except` apart. */
export function takenByOtherLines(pack, rows, except = null) {
	return (rows || [])
		.filter((row) => row !== except && row?.customer_package === pack.package)
		.reduce((sum, row) => sum + (Number(row.quantity ?? row.qty) || 0), 0);
}

/** A package whose last day has passed: the till's own day decides, the last day itself still counts. The site is asked all the same, and its word is the one that stands. */
export function expired(pack, today = new Date()) {
	const end = String(pack?.valid_till || "").slice(0, 10);
	if (!end) return false;
	const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
	return end < day;
}

/**
 * The packages in the order a cashier reads them: the first to end on top, the ones that never end last. The site sorts the other way round (an empty end comes first
 * in a sort by date), which put the package that never expires above the one that ends next month (the audit of 18.11).
 */
export function inUseOrder(packs) {
	const key = (pack) => String(pack?.valid_till || "").slice(0, 10) || "9999-12-31";
	return [...(packs || [])].sort((a, b) => key(a).localeCompare(key(b)));
}

/** Whether the package could pay the line: it covers it, nothing pays it yet, it is not offered, it has not expired, and the package has the sessions left. */
export function canPay(pack, row, rows, isOffered = () => false) {
	if (!pack || !row || !(pack.remaining > 0) || expired(pack)) return false;
	if (row.customer_package || isOffered(row) || !covers(pack, row)) return false;
	return sessionsOf(row) <= pack.remaining - takenByOtherLines(pack, rows, row);
}

/** The line of the cart to pay with the package, or null. @param chosen the line the cashier last chose in the cart (a row of `rows`, or null) */
export function targetLine(pack, rows, chosen = null, isOffered = () => false) {
	const list = rows || [];
	if (chosen && list.includes(chosen) && canPay(pack, chosen, list, isOffered)) return chosen;
	return list.find((row) => canPay(pack, row, list, isOffered)) || null;
}

/** « until DD-MM-YYYY » reads as the board writes it: the end of validity of a package, day first. Nothing when it has no end. */
export function dateOf(value) {
	if (!value) return "";
	const [year, month, day] = String(value).slice(0, 10).split("-");
	return year && month && day ? `${day}-${month}-${year}` : "";
}

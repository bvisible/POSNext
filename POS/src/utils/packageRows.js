//// Neoffice — added file (no upstream equivalent). A line a package of sessions pays (NeoSalon lots G11, voie 1; the audit of 18.11):
//// it is worth 0.00 at a 100 % discount that is the package's, never a rule's or a cashier's. Like an offered row it is left alone by the
//// offers engine (no promotion prices or counts it, no coupon lands on it) and by the discount and price fields of the line dialog:
//// the one way out of the package is « Give the session back », which makes it a paid line again. A promotion that had written
//// 10 % on such a line left it at CHF 63.00 under the words « Settled by the package », and the sale left with both.

import { isOfferedRow } from "@/utils/offeredRows";

/** Whether a line is paid by a session of a package. */
export function isPackageRow(row) {
	return Boolean(row?.customer_package);
}

/** A line the offers engine never prices: an offered row, or a line a package pays. */
export function isFixedRow(row) {
	return isOfferedRow(row) || isPackageRow(row);
}

/** The offers payload without those lines, the same lines posCart.applyDiscountsFromServer reads its answer against. */
export function withoutFixedRows(invoiceData) {
	if (!invoiceData || !Array.isArray(invoiceData.items)) return invoiceData;
	return { ...invoiceData, items: invoiceData.items.filter((item) => !isFixedRow(item)) };
}

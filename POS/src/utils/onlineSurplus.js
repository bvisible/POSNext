//// Neoffice — added file (no upstream equivalent). What a customer paid ONLINE beyond what the sale is worth (NeoSalon, voie 4, 19.11.2026): an appointment paid ahead by card whose
//// sale then shrank (a line taken off, a discount). Online money is not cash: the till must never hand it back as change, and never book a sale that hides it. The restaurant keeps its
//// own reading (a guest who pays more on a phone leaves a tip). The amount is the till's to SAY; what becomes of it (back to the card by the gateway, or a credit of the customer) is the business's decision.
import { roundCurrency } from "@/utils/currency";

/** The part of what was paid online that the sale does not need, 0 when there is none. @param paidOnline what the customer paid before the till @param due what the sale asks, loyalty points taken off */
export function onlineSurplusOf(paidOnline, due) {
	const surplus = roundCurrency(Number(paidOnline) || 0) - roundCurrency(Number(due) || 0);
	return surplus > 0 ? roundCurrency(surplus) : 0;
}

/** The change to give back in cash: what the till collected beyond what was due, the online surplus apart (it is not in the drawer). @param totalPaid what was paid, online money included */
export function cashChangeOf(totalPaid, due, onlineSurplus) {
	const change = roundCurrency(Number(totalPaid) || 0) - roundCurrency(Number(due) || 0) - (Number(onlineSurplus) || 0);
	return change > 0 ? roundCurrency(change) : 0;
}

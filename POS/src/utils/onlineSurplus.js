//// Neoffice — added file (no upstream equivalent). What a customer paid ONLINE beyond what the sale is worth (NeoSalon, voie 4, 19.11.2026): an appointment paid ahead by card whose
//// sale then shrank (a line taken off, a discount). Online money is not cash: the till must never hand it back as change, and never book a sale that hides it. The restaurant keeps its
//// own reading (a guest who pays more on a phone leaves a tip). The amount is the till's to SAY; what becomes of it is the business's decision, taken on 19.11.2026: it stays on the customer's
//// account as a credit of hers (the invoice takes no more of the down payment than the sale is worth, theme `booking/deposit.py`), neither given back in cash nor lost.
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

/** Whether what was paid ahead online covers the whole sale, so that nothing is left to collect at the till (a down payment as big as the sale, or a sale that shrank under it). @param paidOnline what the customer paid before the till @param due what the sale asks, loyalty points taken off */
export function coversTheSale(paidOnline, due) {
	const paid = roundCurrency(Number(paidOnline) || 0);
	return paid > 0 && paid >= roundCurrency(Number(due) || 0);
}

/** What the till says once the sale is booked, from what the site answered (`online_surplus`: `{amount, refunded, kept, to_refund}`): `{ type, text }`, or null when there is nothing to say. @param format how an amount is written */
export function surplusOutcomeMessage(outcome, format) {
	if (!outcome || typeof outcome !== "object") return null;
	if (Number(outcome.refunded) > 0) {
		return { type: "success", text: __("{0} refunded to the customer's card", [format(outcome.refunded)]) };
	}
	if (Number(outcome.to_refund) > 0) {
		return {
			type: "warning",
			text: __("The card refused the refund of {0}: it stays on her account, to give back by hand", [format(outcome.to_refund)]),
		};
	}
	if (Number(outcome.kept) > 0) {
		return { type: "success", text: __("{0} kept on the customer's account as a credit", [format(outcome.kept)]) };
	}
	return null;
}


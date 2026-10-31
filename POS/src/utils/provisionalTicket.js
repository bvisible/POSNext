//// Neoffice — added file (no upstream equivalent). The provisional ticket of a table or takeaway order (the priced
//// summary a restaurant hands the table before cashing in, marked "THIS IS NOT A RECEIPT") prints where the till
//// prints its receipts (NeoRestau lot 1, task 28a). The printer button of the cart called printProvisionalTicket
//// (printInvoice.js, March), which always opened the browser's print window, also on a till with a CloudPRNT receipt
//// printer. Now a till with one saves the order as its screen shows it and has the server print it (cloudprnt app,
//// provisional_ticket.print_provisional_ticket): the VAT of each rate and the rounded total are then the invoice's
//// own, and the ticket never opens the cash drawer. A till without one, or a failure on the way (offline, a refusal of
//// the server), prints it from the browser as before, with a toast saying why.
import { useToast } from "@/composables/useToast";
import { call } from "@/utils/apiWrapper";
import { logger } from "@/utils/logger";

const log = logger.create("ProvisionalTicket");

/**
 * The kitchen state of a line the ticket saves before it was sent to the kitchen: held, as the send dialog holds a
 * line. The kitchen screen shows no order whose lines are all held, and no kitchen ticket prints for one.
 */
export const HELD = "Waiting";

const notSent = (line) => !line.kds_status || line.kds_status === HELD;

/**
 * The order the cart shows, as pos_next.api.invoices.update_invoice takes it: the cart's own payload (the one
 * « Validate » sends), except that a line not sent to the kitchen yet is saved held instead of being sent. The cart's
 * lines are left as they are, so « Validate » still offers them to the kitchen.
 */
export function orderAsShown(cartStore, profile) {
	const order = cartStore.buildOfferEvaluationPayload(profile);
	// The payload has one line per cart line, in the cart's order
	order.items.forEach((line, index) => {
		if (!cartStore.invoiceItems[index]?.kds_status) line.kds_status = HELD;
	});
	if (cartStore.invoiceItems.every(notSent)) order.kds_status = HELD;
	order.is_pos = 1;
	order.docstatus = 0;
	order.posa_pos_opening_shift = cartStore.posOpeningShift;
	if (cartStore.currentDraftId) order.name = cartStore.currentDraftId;
	return order;
}

/**
 * Whether the server may not hold the order as the cart shows it: it holds none yet, a line was never saved, or the
 * cart changed something since it was last sent. An order that needs nothing is not saved again: a save re-reads the
 * kitchen state of every line, which only « Validate » should do.
 */
export function orderNeedsSaving(cartStore) {
	return (
		!cartStore.currentDraftId ||
		cartStore.hasUnsentChanges ||
		cartStore.invoiceItems.some((line) => !line.kds_status)
	);
}

/** The name of the draft Sales Invoice that holds the cart's order as shown, saving it first when it needs it. */
export async function saveOrderAsShown(cartStore, profile) {
	if (!orderNeedsSaving(cartStore)) return cartStore.currentDraftId;
	const saved = await call("pos_next.api.invoices.update_invoice", {
		data: JSON.stringify(orderAsShown(cartStore, profile)),
	});
	if (!saved?.name) throw new Error("The order was not saved");
	cartStore.$patch({ currentDraftId: saved.name });
	return saved.name;
}

/** What the browser's ticket prints: the cart as it stands (the March layout of printInvoice.js). */
function browserTicket(cartStore, shiftStore) {
	return {
		tableName:
			cartStore.restaurantTable?.table_name || cartStore.restaurantTable?.name,
		company: shiftStore.profileCompany,
		items: cartStore.invoiceItems,
		grand_total: cartStore.roundedGrandTotal,
		customer_name:
			cartStore.customer?.customer_name || cartStore.customer?.name || null,
		total_taxes_and_charges: cartStore.totalTax || 0,
	};
}

/** The server's own words for a refusal (frappe-ui puts them in `messages`), as plain text; "" when it gave none. */
function reasonOf(error) {
	const first = Array.isArray(error?.messages)
		? error.messages.find(Boolean)
		: null;
	return String(first?.message ?? first ?? "")
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Print the provisional ticket of the cart's table or takeaway order: on the till's CloudPRNT receipt printer,
 * through the server, when it has one; else, or when that fails, from the browser (`printInBrowser`, printInvoice.js
 * printProvisionalTicket). Never throws. Returns how it was printed: "cloudprnt", "browser" or "none".
 */
export function printProvisionalTicketFromTill(till) {
	// A second tap while the first one is on its way gets the same answer: a never-saved order saved twice would make
	// two orders on the server, and the table would get two tickets
	if (!printing) {
		printing = printProvisionalTicketOnce(till).finally(() => {
			printing = null;
		});
	}
	return printing;
}

/** The print on its way, while there is one (printProvisionalTicketFromTill). */
let printing = null;

async function printProvisionalTicketOnce({
	cartStore,
	cloudPrntStore,
	shiftStore,
	printInBrowser,
}) {
	const toast = useToast();
	const printer = cloudPrntStore.receiptPrinter;
	if (printer) {
		try {
			const invoice = await saveOrderAsShown(
				cartStore,
				shiftStore.currentProfile,
			);
			const answer = await cloudPrntStore.printProvisionalTicket(
				invoice,
				printer.name,
			);
			toast.showSuccess(
				answer?.message ||
					__("Provisional ticket sent to {0}", [printer.label]),
			);
			return "cloudprnt";
		} catch (error) {
			log.warn(
				"CloudPRNT provisional ticket failed, printing it from the browser:",
				error,
			);
			const reason = reasonOf(error);
			toast.showWarning(
				reason
					? __(
							"The ticket printer could not print the provisional ticket ({0}): it prints from the browser",
							[reason],
						)
					: __(
							"The ticket printer could not be reached: the provisional ticket prints from the browser",
						),
			);
		}
	} else {
		toast.showInfo(
			__(
				"This till has no ticket printer: the provisional ticket prints from the browser",
			),
		);
	}
	try {
		printInBrowser(browserTicket(cartStore, shiftStore));
		return "browser";
	} catch (error) {
		log.error("Error printing provisional ticket:", error);
		toast.showError(__("Failed to print provisional ticket"));
		return "none";
	}
}

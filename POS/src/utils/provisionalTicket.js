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

const cents = (value) => Math.round((Number(value) || 0) * 100);
const text = (value) => String(value ?? "").trim();
const lineKey = (line, amountInCents) =>
	JSON.stringify([
		line.item_code || "",
		line.uom || "",
		Math.round((Number(line.qty) || 0) * 1000),
		amountInCents,
		text(line.posa_item_modifiers),
		text(line.posa_special_instructions),
	]);

/**
 * Whether the server's copy of the order (`held`, the draft Sales Invoice) differs from what the screen shows (`shown`,
 * orderAsShown): a line's item, unit, quantity, amount after its discount, options or remarks, the order's discount,
 * or its customer. The lines themselves are compared, not the cart's « changed » flag, which no removal, discount or
 * line edit sets. The line of the guest's tip (`tipItem`), which the till keeps out of its cart, is no change.
 * The kitchen state of a line is not compared: the ticket does not print it.
 */
export function orderDiffersFromServer(shown, held, tipItem) {
	// The cart's amount of a line, as the cart works it out (useInvoice.recalculateItem): its quantity at its unit price,
	// less the line's discount (the cart keeps the discount of the whole line, ERPNext the rate after it)
	const ours = (shown.items || [])
		.map((line) =>
			lineKey(
				line,
				Math.round((Number(line.qty) || 0) * cents(line.rate)) -
					cents(line.discount_amount),
			),
		)
		.sort();
	const theirs = (held.items || [])
		.filter((line) => !tipItem || line.item_code !== tipItem)
		.map((line) => lineKey(line, cents(line.amount)))
		.sort();
	return (
		JSON.stringify(ours) !== JSON.stringify(theirs) ||
		cents(shown.discount_amount) !== cents(held.discount_amount) ||
		text(shown.customer) !== text(held.customer)
	);
}

/**
 * The name of the draft Sales Invoice that holds the cart's order as the screen shows it. An order the server already
 * holds is read and compared (orderDiffersFromServer); it is saved only when it differs, or when the server holds no
 * order yet: a save rewrites every line, and only a real change should.
 */
export async function saveOrderAsShown(cartStore, profile, tipItem = null) {
	const order = orderAsShown(cartStore, profile);
	if (cartStore.currentDraftId) {
		const held = await call("pos_next.api.invoices.get_invoice", {
			invoice_name: cartStore.currentDraftId,
		});
		if (!orderDiffersFromServer(order, held, tipItem))
			return cartStore.currentDraftId;
	}
	const saved = await call("pos_next.api.invoices.update_invoice", {
		data: JSON.stringify(order),
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
 * printProvisionalTicket). `tipItem` is the restaurant's tip item (restaurantStore.tipItem), which the cart does not
 * show. Never throws. Returns how it was printed: "cloudprnt", "browser" or "none".
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
	tipItem = null,
	printInBrowser,
}) {
	const toast = useToast();
	const printer = cloudPrntStore.receiptPrinter;
	if (printer) {
		try {
			const invoice = await saveOrderAsShown(
				cartStore,
				shiftStore.currentProfile,
				tipItem,
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

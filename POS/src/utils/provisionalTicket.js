//// Neoffice — added file (no upstream equivalent). The provisional ticket of a table or takeaway order (the priced
//// summary a restaurant hands the table before cashing in, marked "THIS IS NOT A RECEIPT") prints where the till
//// prints its receipts (NeoRestau lot 1, task 28a). The printer button of the cart called printProvisionalTicket
//// (printInvoice.js, March), which always opened the browser's print window, also on a till with a CloudPRNT receipt
//// printer. Now one tap sends the order AS THE SCREEN SHOWS IT, shaped as the till's payment sends it, to the server
//// (cloudprnt app, provisional_ticket.print_provisional_ticket), which prices it with ERPNext without saving anything
//// and prints it on this till's receipt printer: the VAT of each rate and the rounded total are the payment's own.
//// Printing saves nothing and sends nothing to the kitchen (ruling 93). The button then shows where the ticket stands
//// (ticketState: sending, printing, printed, printer offline, not printed: ruling 97). The browser prints it only when
//// the till has no ticket printer or the server cannot be reached; a refusal of the server is shown, never printed.
import { reactive, toRaw } from "vue";
import { useToast } from "@/composables/useToast";
import { logger } from "@/utils/logger";

const log = logger.create("ProvisionalTicket");

/** How often, and how long, the button follows a ticket the server queued (the drawer dialog follows the same way). */
export const POLL_MS = 1500;
export const POLL_TRIES = 40;
/** How long a final state stays on the button before it goes back to the printer icon. */
export const SHOWN_MS = 6000;

/**
 * The server's refusals (the order is paid, the user may not, another restaurant's table, too many tickets in a minute):
 * shown, not printed. Any other kind of ValidationError (LinkValidationError...) reaches the till as a plain one: the
 * server says it so (provisional_ticket.print_provisional_ticket).
 */
const REFUSALS = new Set([
	"PermissionError",
	"ValidationError",
	"DoesNotExistError",
	"RateLimitExceededError",
]);
/** The server says the till has no ticket printer after all: the browser prints it, as without one. */
const NO_PRINTER = "NoTicketPrinter";

/**
 * What the printer button of the cart shows (InvoiceCart.vue): `phase` is idle, sending, printing, printed, offline or
 * failed, `text` what the waiter reads.
 */
export const ticketState = reactive({ phase: "idle", text: "" });

let clearTimer = null;
let following = 0;

function show(phase, text = "") {
	clearTimeout(clearTimer);
	ticketState.phase = phase;
	ticketState.text = text;
}

function showFor(phase, text) {
	show(phase, text);
	clearTimer = setTimeout(() => show("idle"), SHOWN_MS);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The order the cart shows, as the till's payment sends it (useInvoice.submitInvoice): each line at its rate after its
 * discount (formatItemsForSubmission), the order's discount as the payment applies it (effectiveHeaderDiscount, a
 * whole-cart coupon included), the customer, the till, the table or the takeaway order. `draft` names the open order
 * the server holds, which it only reads (what a guest already paid).
 */
export function orderToPrint(cartStore, profile) {
	return {
		pos_profile: cartStore.posProfile || profile?.name || null,
		customer:
			cartStore.customer?.name ||
			cartStore.customer ||
			profile?.customer ||
			null,
		restaurant_table: cartStore.restaurantTable?.name || null,
		is_takeaway: cartStore.isTakeaway ? 1 : 0,
		takeaway_number: cartStore.takeawayNumber || "",
		draft: cartStore.currentDraftId || null,
		discount_amount: cartStore.effectiveHeaderDiscount || 0,
		items: cartStore.formatItemsForSubmission(toRaw(cartStore.invoiceItems)),
	};
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
 * Print the provisional ticket of the cart's table or takeaway order: through the server on the till's CloudPRNT
 * receipt printer when it has one; from the browser (`printInBrowser`, printInvoice.js printProvisionalTicket) when it
 * has none, or the server cannot be reached. Never throws. Returns "cloudprnt", "refused", "browser" or "none".
 */
export function printProvisionalTicketFromTill(till) {
	// A second tap while the first one is on its way gets the same answer: the table gets one ticket
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
	if (!printer) {
		toast.showInfo(
			__(
				"This till has no ticket printer: the provisional ticket prints from the browser",
			),
		);
		return printFromTheBrowser(cartStore, shiftStore, printInBrowser);
	}
	following += 1;
	show("sending", __("Sending…"));
	let answer;
	try {
		answer = await cloudPrntStore.printProvisionalTicket(
			orderToPrint(cartStore, shiftStore.currentProfile),
		);
	} catch (error) {
		const reason = reasonOf(error);
		if (REFUSALS.has(error?.exc_type)) {
			// The server said no (the order is paid, the user may not, another restaurant's table): no ticket at all
			const text = __("Not printed: {0}", [reason || error.exc_type]);
			showFor("failed", text);
			toast.showError(text);
			return "refused";
		}
		log.warn(
			"CloudPRNT provisional ticket failed, printing it from the browser:",
			error,
		);
		show("idle");
		toast.showWarning(
			error?.exc_type === NO_PRINTER
				? __(
						"This till has no ticket printer: the provisional ticket prints from the browser",
					)
				: __(
						"The ticket printer could not be reached: the provisional ticket prints from the browser",
					),
		);
		return printFromTheBrowser(cartStore, shiftStore, printInBrowser);
	}
	const minutes = answer?.valid_minutes || 15;
	if (answer?.printer_online === false) {
		show("offline", offlineText(minutes));
	} else {
		show("printing", __("Printing…"));
	}
	if (answer?.job_token) follow(answer.job_token, cloudPrntStore, minutes);
	return "cloudprnt";
}

function offlineText(minutes) {
	return __(
		"Printer offline: the ticket will come out when it is back ({0} min)",
		[minutes],
	);
}

/**
 * Follow the ticket `job` until the printer confirms it or it fails, as the drawer dialog follows an opening: Printed,
 * Not printed (its reason), or still waiting for a printer that is offline. A newer print takes the button over.
 */
async function follow(job, cloudPrntStore, minutes) {
	const mine = following;
	for (let attempt = 0; attempt < POLL_TRIES; attempt++) {
		await wait(POLL_MS);
		if (mine !== following) return;
		let status;
		try {
			status = await cloudPrntStore.ticketStatus(job);
		} catch (error) {
			log.warn("The provisional ticket's status could not be read:", error);
			break;
		}
		if (mine !== following) return;
		if (status?.status === "Printed") {
			showFor("printed", __("Printed"));
			return;
		}
		if (status?.status === "Failed" || status?.status === "Expired") {
			const text = __("Not printed: {0}", [status.reason || status.status]);
			showFor("failed", text);
			useToast().showError(text);
			return;
		}
		if (status?.printer_online === false) show("offline", offlineText(minutes));
		else show("printing", __("Printing…"));
	}
	if (mine === following) showFor(ticketState.phase, ticketState.text);
}

function printFromTheBrowser(cartStore, shiftStore, printInBrowser) {
	try {
		printInBrowser(browserTicket(cartStore, shiftStore));
		return "browser";
	} catch (error) {
		log.error("Error printing provisional ticket:", error);
		useToast().showError(__("Failed to print provisional ticket"));
		return "none";
	}
}

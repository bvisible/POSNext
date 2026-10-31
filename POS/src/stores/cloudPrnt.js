//// Neoffice — added file (no upstream equivalent). The till's Star CloudPRNT printer, read from the cloudprnt
//// app (cloudprnt.till.get_till_printing): which printer prints this till's receipts, whether it prints them by
//// itself when a sale is validated, when the cash drawer opens, and the printer's live status for the header.
//// Upstream prints through QZ Tray or the browser only and knows no cash drawer. Without the cloudprnt app the
//// call fails and the store stays empty: the till behaves as upstream (maintenance#1935).
import { call } from "frappe-ui";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const REFRESH_MS = 30000;

export const useCloudPrntStore = defineStore("cloudPrnt", () => {
	const config = ref(null);
	const profile = ref(null);
	let timer = null;

	const receiptPrinter = computed(() => {
		const name = config.value?.receipt_printer;
		return (config.value?.printers || []).find((printer) => printer.name === name) || null;
	});
	// The receipt prints on the server when the sale is validated: the till must not print it again.
	const printsOnSubmit = computed(() =>
		Boolean(receiptPrinter.value && config.value?.auto_print)
	);
	const drawerAvailable = computed(() => Boolean(receiptPrinter.value));
	const canConfigure = computed(() => Boolean(config.value?.can_configure));
	const printerStatus = computed(() => {
		const printer = receiptPrinter.value;
		if (!printer) return null;
		if (!printer.online) return "offline";
		if (printer.paper_empty || printer.cover_open) return "error";
		if (printer.paper_low) return "warning";
		return "ready";
	});

	// The till the config was read for: a refresh that fails (the till is offline for a moment) keeps what was read
	// for the same till, so the till does not suddenly believe it has no printer; another till's config is dropped.
	let loadedFor = null;

	async function load(posProfile) {
		profile.value = posProfile;
		try {
			config.value = await call("cloudprnt.till.get_till_printing", {
				pos_profile: posProfile,
			});
			loadedFor = posProfile;
		} catch {
			if (loadedFor !== posProfile) config.value = null;
		}
		return config.value;
	}

	function follow(posProfile) {
		stop();
		if (!posProfile) {
			config.value = null;
			return;
		}
		load(posProfile);
		timer = setInterval(() => load(posProfile), REFRESH_MS);
	}

	function stop() {
		if (timer) clearInterval(timer);
		timer = null;
	}

	async function save(values) {
		config.value = await call("cloudprnt.till.set_till_printing", {
			pos_profile: profile.value,
			...values,
		});
		return config.value;
	}

	function printReceipt(invoiceName) {
		return call("cloudprnt.api.print_receipt", {
			doctype: "Sales Invoice",
			name: invoiceName,
		});
	}

	// The provisional ticket of `order`, the order the till shows (utils/provisionalTicket.js orderToPrint): priced by
	// the server without saving anything and queued for the receipt printer of the till it names. It never opens the
	// cash drawer, and the caller cannot choose the printer (NeoRestau task 28a).
	function printProvisionalTicket(order) {
		return call("cloudprnt.provisional_ticket.print_provisional_ticket", {
			order: JSON.stringify(order),
		});
	}

	// Where a provisional ticket the server queued stands: Pending, Fetched, Printed, Failed or Expired.
	function ticketStatus(job) {
		return call("cloudprnt.provisional_ticket.ticket_status", { job });
	}

	function testPrint(printer) {
		return call(
			"cloudprnt.cloudprnt.doctype.cloudprnt_settings.cloudprnt_settings.test_print",
			{ printer }
		);
	}

	return {
		config,
		profile,
		receiptPrinter,
		printsOnSubmit,
		drawerAvailable,
		canConfigure,
		printerStatus,
		load,
		follow,
		stop,
		save,
		printReceipt,
		printProvisionalTicket,
		ticketStatus,
		testPrint,
	};
});

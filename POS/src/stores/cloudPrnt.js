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

	async function load(posProfile) {
		profile.value = posProfile;
		try {
			config.value = await call("cloudprnt.till.get_till_printing", {
				pos_profile: posProfile,
			});
		} catch {
			config.value = null;
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
		testPrint,
	};
});

<!-- //// Neoffice — added file (no upstream equivalent). Upstream prints the end-of-day report -->
<!-- //// silently to the one printer saved in the settings, with no way to choose or to put it -->
<!-- //// off. The cashier now picks a QZ Tray printer or the browser print dialog, or prints -->
<!-- //// later; the same dialog serves the shift history (neoffice-maintenance#1235). -->
<template>
	<Dialog v-model="open" :options="{ title: __('Print the end-of-day report'), size: 'md' }">
		<template #body-content>
			<div class="flex flex-col gap-3">
				<p class="text-sm text-gray-600">
					{{ __("Choose where to print the report. You can also print it later from the shift history.") }}
				</p>
				<label class="flex flex-col gap-1 text-sm font-medium text-gray-700">
					{{ __("Printer") }}
					<select
						v-model="selectedPrinter"
						:disabled="loadingPrinters || printing"
						class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
					>
						<option :value="BROWSER">{{ __("Browser print dialog (any printer)") }}</option>
						<option v-for="name in printers" :key="name" :value="name">{{ name }}</option>
					</select>
				</label>
				<p v-if="loadingPrinters" class="text-xs text-gray-500">
					{{ __("Looking for printers...") }}
				</p>
				<p v-else-if="printers.length === 0" class="text-xs text-gray-500">
					{{ __("QZ Tray was not found: only the browser print dialog is available.") }}
				</p>
				<p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>
				<!-- PDF: download, or send by e-mail (recipients set in the POS settings) -->
				<div class="flex flex-col gap-2 border-t border-gray-200 pt-3">
					<span class="text-sm font-medium text-gray-700">{{ __("Or keep it as a PDF") }}</span>
					<div class="flex items-center gap-2">
						<input
							v-model="emailRecipients"
							type="text"
							:disabled="sendingEmail"
							:placeholder="__('E-mail address(es), separated by commas')"
							class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
						/>
						<Button variant="subtle" :loading="sendingEmail" :disabled="!emailRecipients.trim()" @click="sendEmail">
							{{ __("Send by e-mail") }}
						</Button>
					</div>
					<p v-if="emailMessage" class="text-sm text-green-700">{{ emailMessage }}</p>
					<a :href="pdfUrl" target="_blank" rel="noopener" class="text-sm text-blue-600 hover:underline">
						{{ __("Download the PDF") }}
					</a>
				</div>
			</div>
		</template>
		<template #actions>
			<div class="flex justify-end gap-2 w-full">
				<Button variant="subtle" :disabled="printing" @click="later">
					{{ __("Print later") }}
				</Button>
				<Button variant="solid" theme="blue" :loading="printing" @click="print">
					{{ __("Print") }}
				</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { Button, Dialog } from "frappe-ui";
import { computed, ref, watch } from "vue";
import {
	EOD_BROWSER_PRINTER,
	getSavedEodPrinter,
	printEODReport,
	saveEodPrinter,
} from "../utils/printEod";
import { call } from "@/utils/apiWrapper";
import { findPrinters } from "../utils/qzTray";

const BROWSER = EOD_BROWSER_PRINTER;

const props = defineProps({
	modelValue: { type: Boolean, required: true },
	closingShiftName: { type: String, default: "" },
});
// "done": the report was sent; "later": the cashier chose not to print now.
const emit = defineEmits(["update:modelValue", "done", "later"]);

const open = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
});

const printers = ref([]);
const selectedPrinter = ref(BROWSER);
const loadingPrinters = ref(false);
const printing = ref(false);
const errorMessage = ref("");
const emailRecipients = ref("");
const sendingEmail = ref(false);
const emailMessage = ref("");

const pdfUrl = computed(
	() =>
		`/api/method/frappe.utils.print_format.download_pdf?doctype=${encodeURIComponent("POS Closing Shift")}&name=${encodeURIComponent(props.closingShiftName)}&format=${encodeURIComponent("POS Next EOD Report")}&no_letterhead=1`,
);

watch(
	() => props.modelValue,
	async (isOpen) => {
		if (!isOpen) return;
		errorMessage.value = "";
		emailMessage.value = "";
		selectedPrinter.value = BROWSER;
		loadEmailDefaults();
		loadingPrinters.value = true;
		try {
			printers.value = await findPrinters();
		} catch {
			printers.value = [];
		} finally {
			loadingPrinters.value = false;
		}
		const saved = getSavedEodPrinter();
		if (saved === BROWSER || printers.value.includes(saved)) {
			selectedPrinter.value = saved;
		}
	},
	{ immediate: true },
);

async function loadEmailDefaults() {
	try {
		const result = await call("pos_next.api.eod_report.get_eod_email_defaults", {
			closing_shift: props.closingShiftName,
		});
		emailRecipients.value = (result?.message || result)?.recipients || "";
	} catch {
		emailRecipients.value = "";
	}
}

async function sendEmail() {
	if (!props.closingShiftName || !emailRecipients.value.trim()) return;
	sendingEmail.value = true;
	errorMessage.value = "";
	emailMessage.value = "";
	try {
		await call("pos_next.api.eod_report.send_eod_email", {
			closing_shift: props.closingShiftName,
			recipients: emailRecipients.value,
		});
		emailMessage.value = __("The report was sent by e-mail.");
	} catch (err) {
		console.warn("[eod] e-mail failed", err);
		errorMessage.value = __("The e-mail was not sent. Check the address and try again.");
	} finally {
		sendingEmail.value = false;
	}
}

async function print() {
	if (!props.closingShiftName) return;
	printing.value = true;
	errorMessage.value = "";
	try {
		await printEODReport(props.closingShiftName, selectedPrinter.value);
		saveEodPrinter(selectedPrinter.value);
		open.value = false;
		emit("done");
	} catch (err) {
		console.warn("[eod] print failed", err);
		errorMessage.value = __(
			"The report did not print. Pick another printer or the browser dialog, or print it later.",
		);
	} finally {
		printing.value = false;
	}
}

function later() {
	open.value = false;
	emit("later");
}
</script>

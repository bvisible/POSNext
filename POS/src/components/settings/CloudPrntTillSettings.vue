<!-- //// Neoffice — added file (no upstream equivalent). The Printing tab of the till's settings: the Star -->
<!-- //// CloudPRNT printer of this till's receipts, whether it prints them by itself when a sale is -->
<!-- //// validated, when the cash drawer opens, and the printer of each preparation station (kitchen -->
<!-- //// tickets). Saved straight to the printer rows of the cloudprnt app, the one place they live. -->
<!-- //// Upstream prints through QZ Tray or the browser only (maintenance#1935). -->
<template>
	<div
		class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 flex flex-col gap-6"
	>
		<div v-if="!config" class="text-sm text-gray-500">
			{{ __("No network printer: the cloudprnt app is not installed on this site.") }}
		</div>
		<template v-else>
			<p v-if="!config.can_configure" class="text-sm text-amber-700">
				{{ __("Only a manager can change these settings.") }}
			</p>

			<section class="flex flex-col gap-3">
				<h3 class="text-base font-semibold text-gray-900">{{ __("Receipt") }}</h3>
				<label for="cloudprnt-receipt-printer" class="text-sm text-gray-700">
					{{ __("Network printer (Star, no computer needed)") }}
				</label>
				<select
					id="cloudprnt-receipt-printer"
					class="h-11 rounded-lg border border-gray-300 px-3 text-sm"
					:value="config.receipt_printer || ''"
					:disabled="!config.can_configure || saving"
					@change="save({ receipt_printer: $event.target.value || null })"
				>
					<option value="">
						{{ __("None: QZ Tray or the browser print the receipt") }}
					</option>
					<option
						v-for="printer in config.printers"
						:key="printer.name"
						:value="printer.name"
					>
						{{ printer.label }} · {{ statusLabel(printer) }}
					</option>
				</select>
				<template v-if="config.receipt_printer">
					<label class="flex items-center justify-between gap-4 text-sm text-gray-800">
						<span>{{ __("Print the receipt when the sale is validated") }}</span>
						<input
							type="checkbox"
							class="h-5 w-5"
							:checked="Boolean(config.auto_print)"
							:disabled="!config.can_configure || saving"
							@change="
								save({
									receipt_printer: config.receipt_printer,
									auto_print: $event.target.checked ? 1 : 0,
								})
							"
						/>
					</label>
					<div class="flex flex-col gap-2">
						<span class="text-sm text-gray-800">{{
							__("The cash drawer opens at a sale")
						}}</span>
						<div class="grid grid-cols-3 gap-2">
							<button
								v-for="rule in drawerRules"
								:key="rule.value"
								type="button"
								class="min-h-[44px] rounded-lg border px-2 text-sm"
								:class="
									config.open_drawer === rule.value
										? 'border-2 border-orange-400 bg-orange-50 font-semibold text-orange-900'
										: 'border-gray-300 bg-white text-gray-800'
								"
								:disabled="!config.can_configure || saving"
								@click="
									save({
										receipt_printer: config.receipt_printer,
										open_drawer: rule.value,
									})
								"
							>
								{{ rule.label }}
							</button>
						</div>
						<span
							v-if="receiptPrinter && receiptPrinter.drawer_connected"
							class="text-xs text-green-700"
						>
							{{ __("A cash drawer is plugged into {0}", [receiptPrinter.label]) }}
						</span>
					</div>
					<div>
						<button
							type="button"
							class="h-10 rounded-lg border border-gray-300 px-4 text-sm"
							:disabled="!config.can_configure || saving"
							@click="testPrint"
						>
							{{ __("Test print") }}
						</button>
					</div>
				</template>
			</section>

			<section v-if="config.stations && config.stations.length" class="flex flex-col gap-3">
				<h3 class="text-base font-semibold text-gray-900">
					{{ __("Preparation stations") }}
				</h3>
				<p class="text-xs text-gray-500">
					{{
						__(
							"When an order goes to the kitchen, each station with a printer gets its ticket. A printer may serve several stations."
						)
					}}
				</p>
				<div
					v-for="station in config.stations"
					:key="station.station"
					class="grid grid-cols-1 md:grid-cols-[160px_1fr] items-center gap-2"
				>
					<label
						:for="`cloudprnt-station-${station.station}`"
						class="text-sm font-medium text-gray-800"
					>
						{{ station.station }}
					</label>
					<select
						:id="`cloudprnt-station-${station.station}`"
						class="h-11 rounded-lg border border-gray-300 px-3 text-sm"
						:value="station.printer || ''"
						:disabled="!config.can_configure || saving"
						@change="
							save({
								receipt_printer: config.receipt_printer,
								stations: { [station.station]: $event.target.value || null },
							})
						"
					>
						<option value="">{{ __("Screen only") }}</option>
						<option
							v-for="printer in config.printers"
							:key="printer.name"
							:value="printer.name"
						>
							{{ printer.label }}
						</option>
					</select>
				</div>
			</section>
		</template>
	</div>
</template>

<script setup>
import { ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCloudPrntStore } from "@/stores/cloudPrnt";
import { useToast } from "@/composables/useToast";

const props = defineProps({
	posProfile: { type: String, default: "" },
});

const store = useCloudPrntStore();
const { config, receiptPrinter } = storeToRefs(store);
const { showSuccess, showError } = useToast();
const saving = ref(false);

// The values are the cloudprnt rules (cloudprnt.till.DRAWER_RULES); the labels are what the manager reads.
const drawerRules = [
	{ value: "Cash payments", label: __("Cash sales") },
	{ value: "Always", label: __("Always") },
	{ value: "Never", label: __("Never") },
];

watch(
	() => props.posProfile,
	(profile) => profile && store.load(profile),
	{ immediate: true }
);

function statusLabel(printer) {
	if (!printer.online) return __("Offline");
	return printer.status || __("Ready");
}

async function save(values) {
	saving.value = true;
	try {
		await store.save(values);
		showSuccess(__("Printing settings saved"));
	} catch (error) {
		showError(
			error?.messages?.[0] ||
				error?.message ||
				__("The printing settings could not be saved")
		);
		await store.load(props.posProfile);
	} finally {
		saving.value = false;
	}
}

async function testPrint() {
	try {
		const answer = await store.testPrint(config.value.receipt_printer);
		showSuccess(answer?.message || __("Test print sent"));
	} catch (error) {
		showError(
			error?.messages?.[0] || error?.message || __("The test print could not be sent")
		);
	}
}
</script>

<!-- //// Neoffice — added file (no upstream equivalent). The Star CloudPRNT printing of the till's settings: the -->
<!-- //// network printer of this till's receipts, whether it prints them by itself when a sale is validated, when -->
<!-- //// the cash drawer opens (`part="receipt"`), and the printer of each preparation station (`part="stations"`). -->
<!-- //// They live on the printer rows of the cloudprnt app; the screen keeps the choices in a draft and its one -->
<!-- //// « Save » writes them through that app, with the rest (NeoResto lot 1, task 13: they were saved at each -->
<!-- //// change before). Upstream prints through QZ Tray or the browser only (maintenance#1935). -->
<template>
	<div class="flex flex-col gap-[7px]">
		<p v-if="!config" class="text-[12.5px] leading-[1.45] text-pos-muted">
			{{ __("No network printer: the cloudprnt app is not installed on this site.") }}
		</p>
		<template v-else>
			<p v-if="!config.can_configure" class="text-[12.5px] text-amber-700">
				{{ __("Only a manager can change these settings.") }}
			</p>

			<template v-if="part === 'receipt'">
				<div data-setting="receipt_printer">
					<div class="mb-[5px] flex flex-wrap items-center gap-1.5 text-[12.5px] text-pos-muted">
						<label for="cloudprnt-receipt-printer">{{ textOf("receipt_printer").label }}</label>
						<HelpBulb
							v-model:open="openHelp.receipt_printer"
							:text="textOf('receipt_printer').help"
						/>
					</div>
					<select
						id="cloudprnt-receipt-printer"
						class="h-9 w-full min-w-0 rounded-[10px] border border-pos-line bg-white px-3 py-0 text-[14px] text-pos-ink"
						:value="draft.receipt_printer || ''"
						:disabled="!config.can_configure"
						@change="change({ receipt_printer: $event.target.value || null })"
					>
						<option value="">{{ __("None: QZ Tray or the browser print the receipt") }}</option>
						<option v-for="printer in config.printers" :key="printer.name" :value="printer.name">
							{{ printer.label }} · {{ statusLabel(printer) }}
						</option>
					</select>
					<p v-if="openHelp.receipt_printer" :class="HELP_CLASS">{{ textOf("receipt_printer").help }}</p>
				</div>

				<div :class="[SUB_CLASS, draft.receipt_printer ? '' : GREYED_CLASS]" data-setting="auto_print">
					<div class="flex min-h-[30px] items-center gap-2.5">
						<input
							id="cloudprnt-auto-print"
							type="checkbox"
							class="h-[18px] w-[18px] flex-none rounded-[5px] accent-pos-ink text-pos-ink"
							:checked="Boolean(draft.auto_print)"
							:disabled="!config.can_configure || !draft.receipt_printer"
							@change="change({ auto_print: $event.target.checked ? 1 : 0 })"
						/>
						<label for="cloudprnt-auto-print" class="text-[13.5px] text-pos-ink">{{
							textOf("auto_print").label
						}}</label>
						<HelpBulb v-model:open="openHelp.auto_print" :text="textOf('auto_print').help" />
					</div>
					<p v-if="openHelp.auto_print" :class="[HELP_CLASS, 'ml-7']">{{ textOf("auto_print").help }}</p>
				</div>

				<div :class="[SUB_CLASS, draft.receipt_printer ? '' : GREYED_CLASS]" data-setting="open_drawer">
					<div class="mb-[5px] flex flex-wrap items-center gap-1.5 text-[12.5px] text-pos-muted">
						<span>{{ textOf("open_drawer").label }}</span>
						<HelpBulb v-model:open="openHelp.open_drawer" :text="textOf('open_drawer').help" />
					</div>
					<div class="flex gap-1.5" role="radiogroup" :aria-label="textOf('open_drawer').label">
						<button
							v-for="rule in drawerRules"
							:key="rule.value"
							type="button"
							role="radio"
							class="h-9 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-[10px] bg-white px-1.5 text-[13px]"
							:class="
								draft.open_drawer === rule.value
									? 'border-2 border-pos-ink font-bold text-pos-ink'
									: 'border border-pos-line text-pos-muted'
							"
							:aria-checked="draft.open_drawer === rule.value ? 'true' : 'false'"
							:disabled="!config.can_configure || !draft.receipt_printer"
							@click="change({ open_drawer: rule.value })"
						>
							{{ rule.label }}
						</button>
					</div>
					<p v-if="receiptPrinter && receiptPrinter.drawer_connected" class="mt-1 text-[12px] text-green-700">
						{{ __("A cash drawer is plugged into {0}", [receiptPrinter.label]) }}
					</p>
					<p v-if="openHelp.open_drawer" :class="HELP_CLASS">{{ textOf("open_drawer").help }}</p>
				</div>

				<div :class="[SUB_CLASS, draft.receipt_printer ? '' : GREYED_CLASS]" data-setting="test_print">
					<button
						type="button"
						class="h-8 rounded-[10px] border border-pos-line bg-white px-3 text-[12.5px] font-semibold text-pos-ink"
						:disabled="!draft.receipt_printer || testing"
						@click="testPrint"
					>
						{{ textOf("test_print").label }}
					</button>
				</div>
			</template>

			<template v-else>
				<p v-if="!config.stations || !config.stations.length" class="text-[12.5px] text-pos-muted">
					{{ __("No preparation station yet.") }}
				</p>
				<!-- A station's name over its printer: the printer's whole name shows, however narrow the column -->
				<div
					v-for="station in config.stations || []"
					:key="station.station"
					class="flex flex-col gap-1"
					data-setting="station_printers"
				>
					<label
						:for="`cloudprnt-station-${station.station}`"
						class="truncate text-[13px] font-bold text-pos-ink"
					>
						{{ station.station_name || station.station }}
					</label>
					<div class="flex min-w-0 items-center gap-1.5">
						<select
							:id="`cloudprnt-station-${station.station}`"
							class="h-9 w-full min-w-0 rounded-[10px] border border-pos-line bg-white px-3 py-0 text-[14px] text-pos-ink"
							:value="stationPrinter(station) || ''"
							:disabled="!config.can_configure"
							@change="changeStation(station.station, $event.target.value || null)"
						>
							<option value="">{{ __("Screen only") }}</option>
							<option v-for="printer in config.printers" :key="printer.name" :value="printer.name">
								{{ printer.label }}
							</option>
						</select>
						<HelpBulb
							v-model:open="openHelp[`station:${station.station}`]"
							:text="textOf('station_printers').help"
						/>
					</div>
					<p v-if="openHelp[`station:${station.station}`]" :class="HELP_CLASS">
						{{ textOf("station_printers").help }}
					</p>
				</div>
			</template>
		</template>
	</div>
</template>

<script setup>
import { computed, reactive, ref } from "vue"
import { storeToRefs } from "pinia"
import { useCloudPrntStore } from "@/stores/cloudPrnt"
import { useToast } from "@/composables/useToast"
import HelpBulb from "./HelpBulb.vue"

const props = defineProps({
	// "receipt": the till's network printer, its printing and its drawer; "stations": the preparation stations'
	part: { type: String, default: "receipt" },
	// The entries of the list for these settings, by key: their labels and help texts
	definitions: { type: Object, default: () => ({}) },
	// The printing as the screen will save it: { receipt_printer, auto_print, open_drawer, stations: {station: printer} }
	modelValue: { type: Object, required: true },
})

const emit = defineEmits(["update:modelValue"])

const HELP_CLASS =
	"mb-1 mt-1.5 rounded-lg border-l-[3px] border-blue-400 bg-pos-action-soft px-2.5 py-2 text-[12.5px] leading-[1.45] text-pos-ink"
const SUB_CLASS = "ml-[9px] border-l-2 border-pos-line pl-[19px]"
const GREYED_CLASS = "opacity-[0.42]"

const store = useCloudPrntStore()
const { config } = storeToRefs(store)
const { showSuccess, showError } = useToast()
const openHelp = reactive({})
const testing = ref(false)

const draft = computed(() => props.modelValue)
const receiptPrinter = computed(
	() => (config.value?.printers || []).find((printer) => printer.name === draft.value.receipt_printer) || null
)

// The values are the cloudprnt rules (cloudprnt.till.DRAWER_RULES); the labels are what the manager reads.
const drawerRules = [
	{ value: "Cash payments", label: __("Cash sales") },
	{ value: "Always", label: __("Always") },
	{ value: "Never", label: __("Never") },
]

function textOf(key) {
	const definition = props.definitions[key] || {}
	return { label: definition.label || "", help: definition.help || "" }
}

function statusLabel(printer) {
	if (!printer.online) return __("Offline")
	return printer.status || __("Ready")
}

function change(values) {
	emit("update:modelValue", { ...draft.value, ...values })
}

// The printer of a station: the one chosen on this screen, else the one its printer row names today
function stationPrinter(station) {
	const chosen = draft.value.stations || {}
	return station.station in chosen ? chosen[station.station] : station.printer
}

function changeStation(station, printer) {
	change({ stations: { ...(draft.value.stations || {}), [station]: printer } })
}

async function testPrint() {
	testing.value = true
	try {
		const answer = await store.testPrint(draft.value.receipt_printer)
		showSuccess(answer?.message || __("Test print sent"))
	} catch (error) {
		showError(error?.messages?.[0] || error?.message || __("The test print could not be sent"))
	} finally {
		testing.value = false
	}
}
</script>

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
					<!-- //// Neoffice — a station may work on paper alone: no screen, the ticket is all the kitchen reads (Daniel, 02.11.2026). Needs a printer. -->
					<div :class="[SUB_CLASS, stationPrinter(station) ? '' : GREYED_CLASS]" data-setting="station_paper_only">
						<div class="flex min-h-[30px] items-center gap-2.5">
							<input
								:id="`cloudprnt-paper-${station.station}`"
								type="checkbox"
								class="h-[18px] w-[18px] flex-none rounded-[5px] accent-pos-ink text-pos-ink"
								:checked="stationPaperOnly(station)"
								:disabled="!config.can_configure || !stationPrinter(station)"
								@change="changePaperOnly(station.station, $event.target.checked)"
							/>
							<label :for="`cloudprnt-paper-${station.station}`" class="text-[13.5px] text-pos-ink">{{
								__("Paper only: no screen")
							}}</label>
						</div>
						<p class="ml-7 text-[12px] leading-[1.4] text-pos-muted">
							{{ __("The ticket holds the whole meal and nothing is followed on a screen or at the tables.") }}
						</p>
					</div>
					<!-- //// Neoffice — how big the writing of a station's kitchen tickets is (Daniel, 03.11.2026): a setting of the station, Medium by default. Needs a printer. -->
					<div :class="[SUB_CLASS, stationPrinter(station) ? '' : GREYED_CLASS]" data-setting="station_text_size">
						<div class="mb-[5px] text-[12.5px] text-pos-muted">{{ __("Writing of the tickets") }}</div>
						<div class="flex gap-1.5" role="radiogroup" :aria-label="__('Writing of the tickets')">
							<button
								v-for="size in textSizes"
								:key="size.value"
								type="button"
								role="radio"
								class="h-9 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-[10px] bg-white px-1.5 text-[13px]"
								:class="
									stationTextSize(station) === size.value
										? 'border-2 border-pos-ink font-bold text-pos-ink'
										: 'border border-pos-line text-pos-muted'
								"
								:aria-checked="stationTextSize(station) === size.value ? 'true' : 'false'"
								:disabled="!config.can_configure || !stationPrinter(station)"
								@click="changeTextSize(station.station, size.value)"
							>
								{{ size.label }}
							</button>
						</div>
					</div>
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

// The values are the cloudprnt sizes (cloudprnt.kitchen_ticket.TEXT_SIZES); the labels are what the manager reads.
const textSizes = [
	{ value: "Large", label: __("Large", null, "Ticket text size") },
	{ value: "Medium", label: __("Medium", null, "Ticket text size") },
	{ value: "Small", label: __("Small", null, "Ticket text size") },
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
	const values = { stations: { ...(draft.value.stations || {}), [station]: printer } }
	// A station with no printer has its screen and nothing else: it cannot work on paper alone
	if (!printer) values.paper_only = { ...(draft.value.paper_only || {}), [station]: 0 }
	change(values)
}

// A station works on paper alone as this screen says, else as it does today; never without a printer
function stationPaperOnly(station) {
	if (!stationPrinter(station)) return false
	const chosen = draft.value.paper_only || {}
	return station.station in chosen ? Boolean(chosen[station.station]) : Boolean(Number(station.paper_only))
}

function changePaperOnly(station, on) {
	change({ paper_only: { ...(draft.value.paper_only || {}), [station]: on ? 1 : 0 } })
}

// The size of a station's tickets as this screen says, else as it is today
function stationTextSize(station) {
	const chosen = draft.value.text_size || {}
	return chosen[station.station] || station.text_size || "Medium"
}

function changeTextSize(station, size) {
	change({ text_size: { ...(draft.value.text_size || {}), [station]: size } })
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

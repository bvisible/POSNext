<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The control of the print button's settings, in the top bar of the kitchen and runner screens beside the awake settings -->
	<!-- //// (NeoRestau lot 1, task 44): the printer button of a ticket prints a COPY of it for the pass. Four choices, each with its default and ONE line of help: the button on THIS screen -->
	<!-- //// (the kitchen's is on where the station has a printer, the runner's is off), what prints (this station's lines on the ticket, or the whole order), and the COPY mark with the -->
	<!-- //// time. One icon button of 44 px that opens a small panel, never a new bar. The panel holds nothing the page keeps: it shows the settings it is given and says what the person -->
	<!-- //// changed; the device keeps them (usePrintCopy). The screen draws it only where a station has a printer: with none, the choices would change nothing. -->
	<div ref="root" class="relative flex-none">
		<button
			ref="trigger"
			type="button"
			data-test="print-copy-settings"
			class="relative inline-flex h-11 w-11 max-md:h-10 max-md:w-10 flex-none touch-manipulation items-center justify-center rounded-[10px] border border-gray-300 bg-white text-gray-900 active:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
			:aria-label="title"
			:title="title"
			aria-haspopup="dialog"
			:aria-expanded="menuOpen ? 'true' : 'false'"
			@click="toggle"
		>
			<LucidePrinter class="h-5 w-5" aria-hidden="true" />
		</button>

		<!-- Fixed, and placed from the button's own box: a phone's bar wraps, so the button can stand near either edge, and a panel hung from it would leave the screen -->
		<div
			v-if="menuOpen"
			data-test="print-copy-menu"
			role="dialog"
			:aria-label="title"
			:style="panelStyle"
			class="fixed z-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
		>
			<div class="flex items-start gap-3 px-2 py-1.5">
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ buttonLabel }}</div>
					<p data-test="print-copy-help" class="text-xs text-gray-700">{{ __("A printer button beside the ticket's main button prints a copy of it, where its station has a printer.") }}</p>
				</div>
				<button type="button" role="switch" data-test="print-copy-button" :class="SWITCH" :aria-checked="buttonOn ? 'true' : 'false'" :aria-label="buttonLabel" @click.stop="emit('change', buttonKey(screen), !buttonOn)">
					<span :class="[THUMB, buttonOn ? 'translate-x-5' : 'translate-x-0']"></span>
				</button>
			</div>

			<div class="px-2 py-1.5">
				<label class="text-sm font-medium text-gray-900 dark:text-gray-100" for="print-copy-scope">{{ __("What prints") }}</label>
				<p data-test="print-copy-help" class="text-xs text-gray-700">{{ __("The lines of the station on the ticket, or the whole order.") }}</p>
				<select id="print-copy-scope" data-test="print-copy-scope" :class="SELECT" :value="settings.print_scope" @change="emit('change', 'print_scope', $event.target.value)">
					<option :value="SCOPE_STATION" :selected="settings.print_scope === SCOPE_STATION">{{ __("This station's lines") }}</option>
					<option :value="SCOPE_ORDER" :selected="settings.print_scope === SCOPE_ORDER">{{ __("The whole order") }}</option>
				</select>
			</div>

			<div class="flex items-start gap-3 px-2 py-1.5">
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ __("Mark it as a copy") }}</div>
					<p data-test="print-copy-help" class="text-xs text-gray-700">{{ __("COPY and the time at the head of the paper, so that nobody cooks twice.") }}</p>
				</div>
				<button type="button" role="switch" data-test="print-copy-mark" :class="SWITCH" :aria-checked="settings.mark_copy ? 'true' : 'false'" :aria-label="__('Mark it as a copy')" @click.stop="emit('change', 'mark_copy', !settings.mark_copy)">
					<span :class="[THUMB, settings.mark_copy ? 'translate-x-5' : 'translate-x-0']"></span>
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import LucidePrinter from "~icons/lucide/printer"
import { buttonKey, SCOPE_ORDER, SCOPE_STATION, SCREEN_RUNNER } from "@/utils/printCopy"

/**
 * settings: the four settings in force (usePrintCopy's `settings`)
 * screen:   "Kitchen" or "Runner": the control offers the button of THIS screen
 *
 * Emits `change` (key, value) for one setting at a time: the page hands it to usePrintCopy's `setSetting`.
 */
const props = defineProps({
	settings: { type: Object, required: true },
	screen: { type: String, default: "Kitchen" },
})
const emit = defineEmits(["change"])

const title = computed(() => __("Printing a copy of a ticket"))
// One literal `__()` per form: the catalogue extraction reads it from the source
const buttonLabel = computed(() =>
	props.screen === SCREEN_RUNNER ? __("Print button on the runner screen") : __("Print button on the kitchen screen"),
)
const buttonOn = computed(() => !!props.settings[buttonKey(props.screen)])

// The switches and the select are the awake settings' (ScreenAwakeSettings): ON is the ink, OFF a neutral track, the thumb the system's paper
const SWITCH =
	"relative inline-flex h-6 w-11 flex-none touch-manipulation items-center rounded-full border border-transparent bg-gray-600 p-0.5 transition-colors aria-checked:bg-gray-800 dark:aria-checked:bg-ds-paper"
const THUMB = "block h-5 w-5 rounded-full bg-ds-paper shadow transition-transform dark:[[aria-checked=true]>&]:bg-ds-ink"
const SELECT =
	"mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 max-md:h-10 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"

const root = ref(null)
const trigger = ref(null)
const menuOpen = ref(false)
const panelStyle = ref({})

const PANEL_WIDTH = 352
const MARGIN = 8
// Under the button, as far right as it goes, and never off the screen
function place() {
	const box = trigger.value?.getBoundingClientRect()
	const width = Math.min(PANEL_WIDTH, window.innerWidth - 2 * MARGIN)
	const left = Math.max(MARGIN, Math.min((box?.right ?? window.innerWidth) - width, window.innerWidth - width - MARGIN))
	panelStyle.value = { top: `${(box?.bottom ?? 0) + 4}px`, left: `${left}px`, width: `${width}px`, maxHeight: `calc(100dvh - ${(box?.bottom ?? 0) + 4 + MARGIN}px)`, overflowY: "auto" }
}
async function toggle() {
	menuOpen.value = !menuOpen.value
	if (menuOpen.value) {
		place()
		await nextTick()
	}
}

const closeOutside = (event) => {
	if (menuOpen.value && root.value && !root.value.contains(event.target)) menuOpen.value = false
}
const closeOnEscape = (event) => {
	if (event.key === "Escape") menuOpen.value = false
}
onMounted(() => {
	document.addEventListener("click", closeOutside)
	document.addEventListener("keydown", closeOnEscape)
})
onBeforeUnmount(() => {
	document.removeEventListener("click", closeOutside)
	document.removeEventListener("keydown", closeOnEscape)
})
</script>

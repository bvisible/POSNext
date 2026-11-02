<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The control of the screen's four awake settings, in the top bar of the kitchen and runner screens beside the -->
	<!-- //// size of the text (NeoResto lot 1, task 47). The product owner's tablet fell asleep by itself; he also wants a screen nobody touched to go quiet and to come -->
	<!-- //// back with a touch. One icon button of 44 px, as its neighbours, that opens a small panel (never a new bar): keep the screen on, rest the screen after N minutes, -->
	<!-- //// wake on a new ticket, let the tablet sleep after N more minutes of rest, each with ONE line of help. The panel holds nothing the page keeps: it shows the -->
	<!-- //// settings it is given and says what the person changed; the device keeps them (useScreenAwake). -->
	<div ref="root" class="relative flex-none">
		<button
			ref="trigger"
			type="button"
			data-test="awake-settings"
			class="relative inline-flex h-11 w-11 max-md:h-10 max-md:w-10 flex-none touch-manipulation items-center justify-center rounded-[10px] border border-gray-300 bg-white text-gray-900 active:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
			:aria-label="title"
			:title="title"
			aria-haspopup="dialog"
			:aria-expanded="menuOpen ? 'true' : 'false'"
			@click="toggle"
		>
			<LucideTablet class="h-5 w-5" aria-hidden="true" />
		</button>

		<!-- Fixed, and placed from the button's own box: a phone's bar wraps, so the button can stand near either edge, and a panel hung from it would leave the screen -->
		<div
			v-if="menuOpen"
			data-test="awake-settings-menu"
			role="dialog"
			:aria-label="title"
			:style="panelStyle"
			class="fixed z-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
		>
			<div class="flex items-start gap-3 px-2 py-1.5">
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ __("Keep the screen on") }}</div>
					<p data-test="awake-help" class="text-xs text-gray-700">{{ __("The tablet does not go to sleep while this screen is open.") }}</p>
					<p v-if="!wakeLockSupported" data-test="awake-unsupported" class="text-xs font-medium text-gray-700">{{ __("Not available on this browser.") }}</p>
				</div>
				<button type="button" role="switch" data-test="awake-keep-on" :class="SWITCH" :aria-checked="settings.keep_screen_on ? 'true' : 'false'" :aria-label="__('Keep the screen on')" @click.stop="emit('change', 'keep_screen_on', !settings.keep_screen_on)">
					<span :class="[THUMB, settings.keep_screen_on ? 'translate-x-5' : 'translate-x-0']"></span>
				</button>
			</div>

			<div class="px-2 py-1.5">
				<label class="text-sm font-medium text-gray-900 dark:text-gray-100" for="awake-rest-after">{{ __("Rest the screen after") }}</label>
				<p data-test="awake-help" class="text-xs text-gray-700">{{ __("After this long without a touch the screen goes dark. A touch wakes it.") }}</p>
				<select id="awake-rest-after" data-test="awake-rest-after" :class="SELECT" :value="settings.rest_after_minutes" @change="emit('change', 'rest_after_minutes', Number($event.target.value))">
					<option v-for="minutes in restChoices" :key="minutes" :value="minutes" :selected="minutes === settings.rest_after_minutes">{{ minutesLabel(minutes) }}</option>
				</select>
			</div>

			<!-- //// Neoffice — how the screen rests (Daniel, 01.11): the big clock, or plain black. A web page cannot switch the display off: black is as dark as it gets, and a touch (or a new ticket) wakes it. -->
			<div class="px-2 py-1.5" :class="settings.rest_after_minutes === 0 ? 'opacity-50' : ''">
				<label class="text-sm font-medium text-gray-900 dark:text-gray-100" for="awake-rest-style">{{ __("The screen at rest shows") }}</label>
				<p data-test="awake-help" class="text-xs text-gray-700">{{ __("The big clock tells the time. The black screen shows nothing at all.") }}</p>
				<select id="awake-rest-style" data-test="awake-rest-style" :class="SELECT" :disabled="settings.rest_after_minutes === 0" :value="settings.rest_style || 'clock'" @change="emit('change', 'rest_style', $event.target.value)">
					<option value="clock" :selected="(settings.rest_style || 'clock') === 'clock'">{{ __("Big clock") }}</option>
					<option value="black" :selected="settings.rest_style === 'black'">{{ __("Black screen") }}</option>
				</select>
			</div>

			<div class="flex items-start gap-3 px-2 py-1.5">
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ __("Wake on a new ticket") }}</div>
					<p data-test="awake-help" class="text-xs text-gray-700">{{ __("A new ticket lights the screen again.") }}</p>
				</div>
				<button type="button" role="switch" data-test="awake-wake-on-ticket" :class="SWITCH" :aria-checked="settings.wake_on_new_ticket ? 'true' : 'false'" :aria-label="__('Wake on a new ticket')" @click.stop="emit('change', 'wake_on_new_ticket', !settings.wake_on_new_ticket)">
					<span :class="[THUMB, settings.wake_on_new_ticket ? 'translate-x-5' : 'translate-x-0']"></span>
				</button>
			</div>

			<div class="px-2 py-1.5" :class="settings.rest_after_minutes === 0 ? 'opacity-50' : ''">
				<label class="text-sm font-medium text-gray-900 dark:text-gray-100" for="awake-release-after">{{ __("Let the tablet sleep after") }}</label>
				<p data-test="awake-help" class="text-xs text-gray-700">{{ __("After this long at rest, the tablet's own auto-lock takes over.") }}</p>
				<select id="awake-release-after" data-test="awake-release-after" :class="SELECT" :disabled="settings.rest_after_minutes === 0" :value="settings.release_wake_lock_after_minutes" @change="emit('change', 'release_wake_lock_after_minutes', Number($event.target.value))">
					<option v-for="minutes in releaseChoices" :key="minutes" :value="minutes" :selected="minutes === settings.release_wake_lock_after_minutes">{{ minutesLabel(minutes) }}</option>
				</select>
			</div>

			<!-- //// Neoffice — the side where the oldest ticket stands, in the same panel (Daniel, 01.11): the left by default, the right when the screen is set so -->
			<div v-if="oldestRight !== undefined" class="flex items-start gap-3 border-t border-gray-200 px-2 py-1.5 dark:border-gray-600">
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ __("Oldest ticket on the right") }}</div>
					<p data-test="oldest-right-help" class="text-xs text-gray-700">{{ __("The tickets start from the right edge: the oldest is the first one on that side.") }}</p>
				</div>
				<button type="button" role="switch" data-test="oldest-right" :class="SWITCH" :aria-checked="oldestRight ? 'true' : 'false'" :aria-label="__('Oldest ticket on the right')" @click.stop="emit('oldest-right', !oldestRight)">
					<span :class="[THUMB, oldestRight ? 'translate-x-5' : 'translate-x-0']"></span>
				</button>
			</div>

			<!-- //// Neoffice — the kitchen's choice to follow the order of the meal, in the same panel (Daniel, 01.11): a course waits, greyed, until the one before it is done. Drawn only where the page hands the value (the kitchen's screen) -->
			<div v-if="courseOrder !== undefined" class="flex items-start gap-3 border-t border-gray-200 px-2 py-1.5 dark:border-gray-600">
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ __("Follow the order of the meal") }}</div>
					<p data-test="course-order-help" class="text-xs text-gray-700">{{ __("A course waits, greyed, until the one before it is done.") }}</p>
				</div>
				<button type="button" role="switch" data-test="course-order" :class="SWITCH" :aria-checked="courseOrder ? 'true' : 'false'" :aria-label="__('Follow the order of the meal')" @click.stop="emit('course-order', !courseOrder)">
					<span :class="[THUMB, courseOrder ? 'translate-x-5' : 'translate-x-0']"></span>
				</button>
			</div>

			<!-- //// Neoffice — the tickets whose dishes are all with the runner, kept at the end of the column or left off the screen (Daniel, 01.11). Drawn only where the page hands the value (the kitchen's screen, where a station has a runner) -->
			<div v-if="runnerTickets !== undefined" class="flex items-start gap-3 border-t border-gray-200 px-2 py-1.5 dark:border-gray-600">
				<div class="min-w-0 flex-1">
					<div class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ __("Show the tickets with the runner") }}</div>
					<p data-test="runner-tickets-help" class="text-xs text-gray-700">{{ __("A ticket whose dishes are all with the runner stays at the end of the column. Turned off, it leaves this screen.") }}</p>
				</div>
				<button type="button" role="switch" data-test="runner-tickets" :class="SWITCH" :aria-checked="runnerTickets ? 'true' : 'false'" :aria-label="__('Show the tickets with the runner')" @click.stop="emit('runner-tickets', !runnerTickets)">
					<span :class="[THUMB, runnerTickets ? 'translate-x-5' : 'translate-x-0']"></span>
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import LucideTablet from "~icons/lucide/tablet"
import { RELEASE_AFTER_CHOICES, REST_AFTER_CHOICES } from "@/utils/screenAwake"

/**
 * settings:          the four settings in force (useScreenAwake's `settings`)
 * wakeLockSupported: the browser has the Screen Wake Lock (an address without https, or an old browser, has not): said under the first setting
 *
 * Emits `change` (key, value) for one setting at a time: the page hands it to useScreenAwake's `setSetting`.
 */
const props = defineProps({
	settings: { type: Object, required: true },
	wakeLockSupported: { type: Boolean, default: true },
	//// Neoffice — the kitchen's choice to follow the order of the meal (useCourseOrder); left out, the panel does not draw it (the runner's screen has no such rule)
	courseOrder: { type: Boolean, default: undefined },
	//// Neoffice — the side where the oldest ticket stands (useTicketSide); left out, the panel does not draw it
	oldestRight: { type: Boolean, default: undefined },
	//// Neoffice — whether the tickets whose dishes are all with the runner are kept on this screen (useRunnerTickets); left out, the panel does not draw it
	runnerTickets: { type: Boolean, default: undefined },
})
const emit = defineEmits(["change", "course-order", "oldest-right", "runner-tickets"])

const title = computed(() => __("Screen: keep on and rest"))

// The help text is `text-gray-700`: the preset's gray-500 is #999999, 2.85:1 on white (measured in a browser), and the till's dark remap lightens gray-700 by itself. A track of 44 x 24 and a thumb of 20. ON is the ink (every action of the system is ink; paper in dark), OFF is a neutral track. The till's dark remap (index.css) forces
// `!important` colours on the classes `bg-white` and `bg-gray-50/100/200/300` wherever they stand, so none of them is used here: they would flatten the track and the thumb
// to the same dark, and a switch that is on could not be told from one that is off. The thumb is the system's paper (`ds-paper`), and ink on a paper track in dark.
const SWITCH =
	"relative inline-flex h-6 w-11 flex-none touch-manipulation items-center rounded-full border border-transparent bg-gray-600 p-0.5 transition-colors aria-checked:bg-gray-800 dark:aria-checked:bg-ds-paper"
const THUMB = "block h-5 w-5 rounded-full bg-ds-paper shadow transition-transform dark:[[aria-checked=true]>&]:bg-ds-ink"
const SELECT =
	"mt-1 h-11 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 max-md:h-10 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"

// One literal `__()` per form: the catalogue extraction reads it from the source
const minutesLabel = (minutes) => (minutes === 0 ? __("Never") : __("{0} min", [minutes]))

// The choices, plus the value in force when it is none of them (a restaurant may bring 45)
const withCurrent = (choices, current) => (choices.includes(current) ? choices : [...choices, current].sort((a, b) => a - b))
const restChoices = computed(() => withCurrent(REST_AFTER_CHOICES, props.settings.rest_after_minutes))
const releaseChoices = computed(() => withCurrent(RELEASE_AFTER_CHOICES, props.settings.release_wake_lock_after_minutes))

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

<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The layer a screen at REST is drawn as (NeoRestau lot 1, task 47). A web page cannot switch the physical -->
	<!-- //// screen off nor dim it, so after N minutes without a touch the kitchen and runner screens are covered by this near-black layer: a small clock, how many -->
	<!-- //// orders are waiting, a moon, in the dim warm grey the design system gives to tertiary text on a dark ground (4.9:1 and more on black, readable in the dark and -->
	<!-- //// no brighter than it has to be). The wake lock and the live updates run on under it. It is the same dark in light mode and in dark mode (no `dark:` here), it -->
	<!-- //// holds nothing to press: the touch that wakes the screen is swallowed by useScreenAwake, so that it never reaches the control it landed on. Drawn from the -->
	<!-- //// page's root, above everything the page draws (the full-screen ticket, the undo toast). -->
	<div
		v-if="resting"
		data-test="screen-rest"
		role="status"
		:aria-label="__('Screen at rest')"
		class="fixed inset-0 z-[9999] flex touch-none select-none flex-col items-center justify-center gap-3 bg-black text-center text-ds-sand-400"
	>
		<!-- //// Neoffice — a device set to go BLACK draws the layer and nothing on it (Daniel, 01.11: « éteindre l'écran au lieu de la veille avec l'heure ») -->
		<LucideMoon v-if="!blank" data-test="rest-moon" class="h-5 w-5" aria-hidden="true" />
		<!-- //// Neoffice — the clock is the page's big word (Daniel, 01.11: « le temps affiché en grand est intéressant »): its size follows the screen, whichever way the tablet is held, and the rest is small under it -->
		<time v-if="!blank" data-test="rest-clock" class="font-display text-[length:min(30vw,44vh)] leading-none tabular-nums">{{ clock }}</time>
		<p v-if="!blank" data-test="rest-count" class="text-base font-medium">{{ label }}</p>
		<p v-if="!blank" data-test="rest-hint" class="text-sm">{{ __("Touch the screen to wake it") }}</p>
	</div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from "vue"
import LucideMoon from "~icons/lucide/moon"

/**
 * resting: the layer is drawn (the page binds the composable's `resting`)
 * label:   how many orders are waiting, in the words of the page (« 3 commandes en attente »), already translated
 * blank:   the device rests as plain black: the layer holds no clock and no word (the setting `rest_style`)
 */
const props = defineProps({
	resting: { type: Boolean, default: false },
	label: { type: String, default: "" },
	blank: { type: Boolean, default: false },
})

// The time of day, 24 hours, the browser's own language. Read again every ten seconds: the minute turns within ten seconds of the clock's.
const CLOCK_EVERY_MS = 10 * 1000
const formatter = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
})
const clock = ref(formatter.format(new Date()))
let timer = null

function stopClock() {
	if (timer) clearInterval(timer)
	timer = null
}
watch(
	() => props.resting,
	(resting) => {
		stopClock()
		if (!resting) return
		clock.value = formatter.format(new Date())
		timer = setInterval(() => {
			clock.value = formatter.format(new Date())
		}, CLOCK_EVERY_MS)
	},
	{ immediate: true },
)
onBeforeUnmount(stopClock)
</script>

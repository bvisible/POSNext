<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The discreet chip of the kitchen and runner screens (NeoRestau lot 1, Daniel, 01.11): a sound is enabled in the till's settings, but a browser lets no page make a sound -->
	<!-- //// before somebody has touched it, and a tablet in a kitchen is left alone for hours. Until the page is touched the chip says so; any touch unlocks the audio (utils/alertSoundPlayer), the chip itself included. Ink on paper, -->
	<!-- //// a quiet outline: it is a reminder, not an alarm. Below 1024 px only its icon is drawn, as the bar's other buttons, and its words stay for a screen reader. -->
	<button
		v-if="visible"
		type="button"
		data-test="sound-unlock"
		class="inline-flex h-11 flex-none touch-manipulation items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-gray-300 bg-white px-3 text-xs font-medium text-gray-900 active:bg-gray-100 max-[1024px]:px-0 max-[1024px]:w-11 max-[1024px]:justify-center dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
		:aria-label="label"
		:title="label"
		@click="unlockAlertSounds()"
	>
		<LucideVolumeX class="h-5 w-5 flex-none" aria-hidden="true" />
		<span class="max-[1024px]:sr-only">{{ label }}</span>
	</button>
</template>

<script setup>
import { computed, watch } from "vue"
import LucideVolumeX from "~icons/lucide/volume-x"
import { alertSoundsLocked, alertSoundsSupported, listenForFirstTouch, unlockAlertSounds } from "@/utils/alertSoundPlayer"

/**
 * enabled: whether the screen has a sound to play (the till's setting is not « None »). The chip is there while it has and the page has not been touched.
 */
const props = defineProps({
	enabled: { type: Boolean, default: false },
})

const label = computed(() => __("Touch the screen to enable the sound"))
const visible = computed(() => props.enabled && alertSoundsSupported() && alertSoundsLocked.value)

// The first touch of the page unlocks the audio, whatever the touch is for; asked again when a sound gets enabled later
watch(
	() => props.enabled,
	(enabled) => {
		if (enabled) listenForFirstTouch()
	},
	{ immediate: true },
)
</script>

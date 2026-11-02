<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The theme button of the kitchen and runner screens (NeoResto lot 1, task 38a-2, ruling 131). A tablet that opens in dark -->
	<!-- //// because its system is dark gave the cook no way to change it: these screens have no user menu. One button of 44 px in the top bar: its icon is the mode in use (a sun -->
	<!-- //// for Light, a moon for Dark, a half-moon for Auto, the system's own), one tap goes on to the next (Auto, Light, Dark), and a press held for half a second opens the -->
	<!-- //// three with their names, for whoever wants to know what the icon means. It reads and writes the mode the till's own user menu does (utils/colorMode). -->
	<div ref="root" class="relative flex-none">
		<button
			type="button"
			data-test="theme-button"
			:data-mode="mode"
			class="relative inline-flex h-11 w-11 max-md:h-10 max-md:w-10 touch-manipulation select-none items-center justify-center rounded-[10px] border border-gray-300 bg-white text-gray-900 active:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700"
			:aria-label="label"
			:title="label"
			aria-haspopup="menu"
			:aria-expanded="menuOpen ? 'true' : 'false'"
			@pointerdown="startHold"
			@pointerup="endHold"
			@pointerleave="endHold"
			@pointercancel="endHold"
			@contextmenu.prevent
			@click="onTap"
		>
			<component :is="ICONS[mode]" class="h-5 w-5" aria-hidden="true" />
		</button>

		<div
			v-if="menuOpen"
			data-test="theme-menu"
			role="menu"
			class="absolute right-0 top-full z-40 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
		>
			<button
				v-for="choice in COLOR_MODES"
				:key="choice"
				type="button"
				role="menuitemradio"
				:data-test="`theme-${choice}`"
				:aria-checked="choice === mode ? 'true' : 'false'"
				class="flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left text-sm font-medium text-gray-900 active:bg-gray-100 dark:text-gray-100 dark:active:bg-gray-700"
				:class="choice === mode ? 'bg-gray-100 dark:bg-gray-700' : ''"
				@click.stop="choose(choice)"
			>
				<component :is="ICONS[choice]" class="h-4 w-4 flex-none" aria-hidden="true" />
				<span class="flex-1">{{ nameOf(choice) }}</span>
				<LucideCheck v-if="choice === mode" class="h-4 w-4 flex-none" aria-hidden="true" />
			</button>
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import LucideCheck from "~icons/lucide/check"
import LucideContrast from "~icons/lucide/contrast"
import LucideMoon from "~icons/lucide/moon"
import LucideSun from "~icons/lucide/sun"
import {
	COLOR_MODE_KEY,
	COLOR_MODES,
	applyColorMode,
	nextColorMode,
	readColorMode,
} from "@/utils/colorMode"

/**
 * The colour mode of the page, one tap to change it. The mode is the device's (localStorage), as the till's own switch keeps it.
 *
 * persistDeskTheme: also write the signed-in desk user's `User.desk_theme`, as the till's user menu does. A tablet signed in with an account of its own
 *   is no desk user: it keeps its choice on the device and never touches a desk's setting.
 */
const props = defineProps({
	persistDeskTheme: { type: Boolean, default: false },
})

const ICONS = { system: LucideContrast, light: LucideSun, dark: LucideMoon }

// How long a press is held before it opens the three choices instead of going on to the next one
const HOLD_MS = 500

const mode = ref(readColorMode())
const menuOpen = ref(false)
const root = ref(null)

// One literal `__()` per word: the catalogue extraction reads it from the source
function nameOf(choice) {
	switch (choice) {
		case "light":
			return __("Light", null, "Colour mode")
		case "dark":
			return __("Dark", null, "Colour mode")
		default:
			return __("Auto", null, "Colour mode")
	}
}
const label = computed(() => __("Theme: {0}", [nameOf(mode.value)]))

function choose(next) {
	mode.value = next
	applyColorMode(next, { persistDeskTheme: props.persistDeskTheme })
	menuOpen.value = false
}

// A held press opens the menu, and the click that ends it is not a tap
let holdTimer = null
let heldOpen = false
function startHold() {
	endHold()
	heldOpen = false
	holdTimer = setTimeout(() => {
		holdTimer = null
		heldOpen = true
		menuOpen.value = true
	}, HOLD_MS)
}
function endHold() {
	if (holdTimer) clearTimeout(holdTimer)
	holdTimer = null
}
function onTap() {
	if (heldOpen) {
		heldOpen = false
		return
	}
	if (menuOpen.value) {
		menuOpen.value = false
		return
	}
	choose(nextColorMode(mode.value))
}

// The mode may be changed from elsewhere (the till's menu in another tab, the desk's toggle): the icon follows
function follow(event) {
	if (event.key !== COLOR_MODE_KEY) return
	mode.value = readColorMode()
}
const closeOutside = (event) => {
	if (menuOpen.value && root.value && !root.value.contains(event.target)) menuOpen.value = false
}
const closeOnEscape = (event) => {
	if (event.key === "Escape") menuOpen.value = false
}
onMounted(() => {
	window.addEventListener("storage", follow)
	document.addEventListener("click", closeOutside)
	document.addEventListener("keydown", closeOnEscape)
})
onBeforeUnmount(() => {
	endHold()
	window.removeEventListener("storage", follow)
	document.removeEventListener("click", closeOutside)
	document.removeEventListener("keydown", closeOnEscape)
})
</script>

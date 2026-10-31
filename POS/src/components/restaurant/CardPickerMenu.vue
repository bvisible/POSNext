<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The « ⋯ » at the end of the order screen's row of card buttons -->
	<!-- //// (NeoRestau lot 1, task 25): small and grey, like the floor plan's, so that it is not pressed by accident. It lists -->
	<!-- //// the restaurant's other active cards that the opening hours keep off the till right now; picking one opens it on -->
	<!-- //// this till (through the authorization gate where a rule asks a manager's PIN) until it is closed or the shift is. -->
	<!-- //// A tap outside only closes it, as on the floor plan. -->
	<div v-if="available" ref="root" data-test="card-more-menu" class="relative flex-shrink-0">
		<button
			type="button"
			data-test="card-more"
			class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-800 transition-colors touch-manipulation"
			aria-haspopup="menu"
			:aria-expanded="open"
			:aria-label="__('Open another card')"
			:title="__('Open another card')"
			@click="toggle"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="ICON_MORE" />
			</svg>
		</button>
		<div
			v-if="open"
			role="menu"
			data-test="card-more-list"
			class="absolute end-0 top-full mt-1 z-30 w-max min-w-[14rem] max-w-xs max-h-[60vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black/5"
		>
			<CardPickerList :cards="cards" :busy="picker.state.busy" menu @pick="onPick" />
		</div>
	</div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from "vue"
import { useCardPicker } from "@/composables/useCardPicker"
import CardPickerList from "./CardPickerList.vue"

const picker = useCardPicker()
const { cards, available } = picker

// The glyph of the floor plan's « ⋯ » (« more-horizontal » as settings/SettingsSection.vue draws it)
const ICON_MORE =
	"M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"

const open = ref(false)
const root = ref(null)

function toggle() {
	if (open.value) close()
	else open.value = true
}

// The focus goes back to the « ⋯ » when the menu is closed from the keyboard
function close({ restoreFocus = false } = {}) {
	if (!open.value) return
	open.value = false
	if (restoreFocus) nextTick(() => root.value?.querySelector("button")?.focus())
}

// The menu closes before the card is opened: the approval of a manager, if a rule asks for it, leaves nothing hanging
// over its dialog
async function onPick(card) {
	close()
	await picker.pick(card)
}

function onPointerDown(event) {
	if (!root.value?.contains(event.target)) close()
}

function onKeyDown(event) {
	if (event.key === "Escape") close({ restoreFocus: true })
}

function stopListening() {
	document.removeEventListener("pointerdown", onPointerDown, true)
	document.removeEventListener("keydown", onKeyDown)
}

// Heard on the whole page while it is open and not a moment longer. The pointer is heard on the way down (capture): a
// card button stops nothing, but a tap on the grid has to close the menu all the same.
watch(open, async (isOpen) => {
	if (!isOpen) return stopListening()
	document.addEventListener("pointerdown", onPointerDown, true)
	document.addEventListener("keydown", onKeyDown)
	await nextTick()
	root.value?.querySelector('[role="menuitem"]')?.focus()
})
// No menu once its last card is gone (opened, or the hours changed under it)
watch(available, (shown) => {
	if (!shown) close()
})
onBeforeUnmount(stopListening)
</script>

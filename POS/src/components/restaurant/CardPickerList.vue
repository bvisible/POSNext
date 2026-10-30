<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The list of the cards the opening hours keep off the till, one -->
	<!-- //// button per card (NeoRestau lot 1, task 25). The « ⋯ » of the order screen's card row draws it in its menu and the -->
	<!-- //// floor plan's entry « Open another card » in a dialog: one list, so that both places look and answer alike. -->
	<div class="py-1" data-test="card-picker-list">
		<button
			v-for="card in cards"
			:key="card.name"
			type="button"
			:role="menu ? 'menuitem' : undefined"
			data-test="card-option"
			:data-card="card.name"
			:disabled="busy"
			class="flex flex-col items-start justify-center w-full min-h-target px-4 py-2 text-start text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors touch-manipulation"
			@click="emit('pick', card)"
		>
			<span class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ cardLabel(card) }}</span>
			<span
				v-if="card.description"
				class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2"
				>{{ card.description }}</span
			>
		</button>
	</div>
</template>

<script setup>
import { cardLabel } from "@/utils/cardLabel"

/**
 * The cards on offer: [{ name, card_name, description? }]. `menu` gives the buttons the role of the entries of a menu,
 * for the « ⋯ » that draws them as one; `busy` holds them while a card is being opened.
 */
defineProps({
	cards: { type: Array, default: () => [] },
	menu: { type: Boolean, default: false },
	busy: { type: Boolean, default: false },
})
const emit = defineEmits(["pick"])
</script>

<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The row of card buttons of the order screen (NeoRestau lot 1, -->
	<!-- //// task 25), taken out of POSSale.vue so that it can be tested: one button per card; one short muted line above -->
	<!-- //// them says that the opening hours are over and whose card is still on the till; a card opened by hand carries a -->
	<!-- //// small mark and a « × » that closes it; the « ⋯ » that fetches another card ends the row. -->
	<div
		data-test="card-tabs"
		class="px-1.5 sm:px-3 pt-1.5 sm:pt-3 pb-1.5 sm:pb-2 bg-white border-b border-gray-200"
	>
		<p
			v-if="afterHours"
			data-test="after-hours-line"
			class="mb-1 text-[11px] sm:text-xs text-gray-500"
		>
			{{ afterHoursLine }}
		</p>
		<div class="flex items-center gap-1">
			<!-- The buttons scroll; the « ⋯ » stays out of the scroller, whose edge would cut its list off -->
			<div
				data-test="card-tabs-scroller"
				class="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory min-w-0 flex-1"
			>
				<div
					v-for="card in cards"
					:key="card.name"
					data-test="card-tab"
					:data-card="card.name"
					class="flex items-center gap-0.5 snap-start flex-shrink-0"
				>
					<button
						type="button"
						data-test="card-button"
						:aria-pressed="selected === card.name"
						@click="emit('select', card.name)"
						class="flex items-center gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-neo-sm text-[10px] sm:text-xs font-medium whitespace-nowrap transition-[background-color,border-color] duration-75 touch-manipulation"
						:class="[
							selected === card.name
								? card.is_permanent
									? 'bg-indigo-50 text-indigo-600 border-2 border-indigo-500 shadow-neo'
									: 'bg-blue-50 text-blue-600 border-2 border-blue-500 shadow-neo'
								: card.is_permanent
									? 'bg-indigo-50/50 text-indigo-600 border border-indigo-200 hover:bg-indigo-50 active:bg-indigo-100'
									: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 active:bg-gray-100',
						]"
					>
						<svg
							v-if="card.is_permanent"
							class="w-3 h-3 flex-shrink-0"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
							/>
						</svg>
						<!-- The mark of a card opened by hand: Lucide « hand » -->
						<span
							v-if="card.opened_by_hand"
							data-test="by-hand-mark"
							role="img"
							:aria-label="__('Opened by hand')"
							:title="__('Opened by hand')"
							class="inline-flex flex-shrink-0 opacity-70"
						>
							<svg
								class="w-3 h-3"
								fill="none"
								stroke="currentColor"
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2m0 4V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2m0 4.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"
								/>
								<path
									d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"
								/>
							</svg>
						</span>
						<!-- The permanent card is shown by its label, not by the English name it is stored under (NeoRestau lot 1, task 9) -->
						{{ cardLabel(card) }}
					</button>
					<!-- Closes a card opened by hand; the hours decide again for it -->
					<button
						v-if="card.opened_by_hand"
						type="button"
						data-test="close-card"
						:aria-label="__('Close this card')"
						:title="__('Close this card')"
						@click.stop="emit('close-card', card.name)"
						class="inline-flex items-center justify-center w-7 h-7 rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation"
					>
						<svg
							class="w-3.5 h-3.5"
							fill="none"
							stroke="currentColor"
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
				<slot name="trailing" />
			</div>
			<CardPickerMenu />
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue"
import { cardLabel } from "@/utils/cardLabel"
import CardPickerMenu from "./CardPickerMenu.vue"

/**
 * The cards of the row, in the order they are shown ([{ name, card_name, is_permanent?, opened_by_hand? }]), the one that
 * is selected, and whether the opening hours are over (`afterHours`) with the label of the service whose card is
 * still there (`serviceLabel`, as the slot was typed). It says what was picked (`select`) and what was closed
 * (`close-card`); the screen adds its own buttons at the end of the row through the `trailing` slot.
 */
const props = defineProps({
	cards: { type: Array, default: () => [] },
	selected: { type: String, default: null },
	afterHours: { type: Boolean, default: false },
	serviceLabel: { type: String, default: null },
})
const emit = defineEmits(["select", "close-card"])

const afterHoursLine = computed(() =>
	props.serviceLabel
		? __("Outside opening hours · card of the {0} service", [props.serviceLabel])
		: __("Outside opening hours · card of the last service"),
)
</script>

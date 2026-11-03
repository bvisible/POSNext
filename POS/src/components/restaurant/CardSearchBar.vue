<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The search of the open card and its grid / list switch, taken out of POSSale.vue (NeoResto lot 1, product owner, 03.11.2026: « on a une, deux, trois, -->
	<!-- //// quatre lignes au sommet avant d'avoir les articles »). They are no longer a row of their own: they sit at the end of the row of the card buttons (RestaurantCardTabs.vue, `aside` slot), -->
	<!-- //// at the height of a card button, and wrap under it where the pane is too narrow for both. -->
	<div class="flex min-w-0 flex-1 items-center gap-1 sm:gap-2" data-test="card-search-bar">
		<div class="relative min-w-0 flex-1">
			<svg
				class="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 sm:start-3 sm:h-4 sm:w-4"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			<input
				:value="query"
				type="text"
				data-test="card-search-input"
				:placeholder="__('Search in card...')"
				class="w-full rounded-neo-sm border border-gray-300 px-2 py-1.5 ps-7 text-[11px] transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 sm:px-3 sm:py-[7px] sm:ps-10 sm:text-xs"
				@input="emit('update:query', $event.target.value)"
			/>
		</div>
		<div
			class="flex flex-shrink-0 items-center gap-0.5 rounded-neo-sm bg-gray-100 p-0.5"
			role="group"
			:aria-label="__('Display')"
		>
			<button
				type="button"
				data-view="grid"
				:aria-pressed="view === 'grid'"
				:aria-label="__('Grid')"
				class="touch-manipulation rounded p-1.5 transition-[background-color,box-shadow] duration-75 sm:p-[7px]"
				:class="view === 'grid' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'"
				@click="emit('update:view', 'grid')"
			>
				<svg
					class="h-3.5 w-3.5 text-gray-600 sm:h-4 sm:w-4"
					fill="currentColor"
					viewBox="0 0 20 20"
					aria-hidden="true"
				>
					<path
						d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
					/>
				</svg>
			</button>
			<button
				type="button"
				data-view="list"
				:aria-pressed="view === 'list'"
				:aria-label="__('List')"
				class="touch-manipulation rounded p-1.5 transition-[background-color,box-shadow] duration-75 sm:p-[7px]"
				:class="view === 'list' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'"
				@click="emit('update:view', 'list')"
			>
				<svg
					class="h-3.5 w-3.5 text-gray-600 sm:h-4 sm:w-4"
					fill="currentColor"
					viewBox="0 0 20 20"
					aria-hidden="true"
				>
					<path
						fill-rule="evenodd"
						d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
		</div>
	</div>
</template>

<script setup>
/**
 * The search text of the card (`v-model:query`) and how it is laid out, « grid » or « list » (`v-model:view`).
 */
defineProps({
	query: { type: String, default: "" },
	view: { type: String, default: "grid" },
});
const emit = defineEmits(["update:query", "update:view"]);
</script>

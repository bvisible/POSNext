<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The entry of « Open a tablet » on the floor plan's line -->
	<!-- //// (NeoRestau lot 1, task 16): shown to whoever may set the restaurant up (the till is told the right, -->
	<!-- //// `manage_settings`; the server checks it again), it opens the dialog that pairs a tablet as the kitchen's -->
	<!-- //// or the runner's screen. -->
	<button
		v-if="canSetUp"
		type="button"
		class="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
		data-test="open-a-tablet"
		@click="open = true"
	>
		<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">
			<rect x="4" y="2" width="16" height="20" rx="2" />
			<path d="M12 18h.01" />
		</svg>
		{{ __("Open a tablet") }}
	</button>
	<OpenTabletDialog v-if="canSetUp && open" v-model="open" :restaurant="restaurantStore.tillRestaurant" />
</template>

<script setup>
import { computed, ref } from "vue"
import OpenTabletDialog from "@/components/restaurant/OpenTabletDialog.vue"
import { useRestaurantStore } from "@/stores/restaurant"

const restaurantStore = useRestaurantStore()
// Who may set the restaurant up: the right the server told the till (pos_next.restaurant.permissions)
const canSetUp = computed(() => Boolean(restaurantStore.can?.manage_settings))
const open = ref(false)
</script>

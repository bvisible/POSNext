<template>
	<!-- //// Neoffice — added file (no upstream equivalent). « Print the menu QR »: the entry that prints the sheet -->
	<!-- //// with the QR code of the restaurant's public menu, to stand on the tables (NeoRestau lot 1, task 17). -->
	<!-- //// It is a menu entry of its own, to be mounted in the floor plan's « ⋯ » menu: it is there only where -->
	<!-- //// the restaurant switched the public menu on, and only for who may set the restaurant up (the till's -->
	<!-- //// `manage_settings` right, told by the server). Upstream POSNext has no guest surface. -->
	<button
		v-if="visible"
		type="button"
		class="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
		:disabled="printing"
		@click="print"
	>
		<svg
			class="h-4 w-4 flex-none"
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.6"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<polyline points="6 9 6 2 18 2 18 9" />
			<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
			<rect width="12" height="8" x="6" y="14" />
		</svg>
		<span>{{ __("Print the menu QR") }}</span>
	</button>
</template>

<script setup>
import { computed, ref } from "vue"
import { useToast } from "@/composables/useToast"
import { useRestaurantStore } from "@/stores/restaurant"
import { printMenuQr } from "@/utils/menuQrSheet"
import { publicMenuUrl } from "@/utils/publicMenu"

const restaurantStore = useRestaurantStore()
const { showError } = useToast()
const printing = ref(false)

// The restaurant the settings on screen were read for, the same that says the public menu is on
const restaurant = computed(
	() => restaurantStore.restaurantSettings?.restaurant || restaurantStore.tillRestaurant || "",
)

// Shown only where the restaurant published its menu, and to whoever the server lets set the restaurant up. A right the
// server did not grant, or did not send yet, is refused (restaurantStore.can).
const visible = computed(
	() =>
		restaurantStore.can?.manage_settings === true &&
		restaurantStore.restaurantSettings?.enable_public_menu === true &&
		!!restaurant.value,
)

async function print() {
	printing.value = true
	try {
		await printMenuQr({
			restaurantName: restaurantStore.restaurantName || restaurant.value,
			url: publicMenuUrl(restaurant.value),
		})
	} catch {
		showError(__("The menu QR could not be printed."))
	} finally {
		printing.value = false
	}
}
</script>

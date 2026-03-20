<template>
	<div class="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b dark:border-gray-800">
			<div>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
					{{ __("Select Table") }}
				</h2>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					{{ __("Choose a table to begin the order") }}
				</p>
			</div>

			<!-- Area Tabs -->
			<div v-if="areas.length > 1" class="border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
				<div class="flex">
					<button
						v-for="area in areas"
						:key="area.name"
						@click="selectedArea = area.name"
						:class="[
							'px-4 py-2 font-medium text-sm transition-colors border-b-2 relative whitespace-nowrap',
							selectedArea === area.name
								? 'border-b-blue-600 text-blue-600 font-semibold'
								: 'border-b-transparent text-gray-500 hover:text-gray-700'
						]"
					>
						{{ area.area_name }}
						<span
							v-if="restaurantStore.occupiedCountByArea[area.area_name] > 0"
							class="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full ms-2"
						>
							{{ restaurantStore.occupiedCountByArea[area.area_name] }}
						</span>
					</button>
				</div>
			</div>
		</div>

		<!-- Tables Grid -->
		<div class="flex-1 overflow-y-auto p-4">
			<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
				<div
					v-for="table in filteredTables"
					:key="table.name"
					class="relative group cursor-pointer rounded-xl border-2 transition-all duration-200 aspect-square flex flex-col items-center justify-center p-4 hover:shadow-lg"
					:class="[
						table.status === 'Empty' ? 'border-green-200 bg-green-50 hover:border-green-400 dark:border-green-900/50 dark:bg-green-900/20 dark:hover:border-green-500' : '',
						table.status === 'Occupied' ? 'border-red-200 bg-red-50 hover:border-red-400 dark:border-red-900/50 dark:bg-red-900/20 dark:hover:border-red-500' : '',
						table.status === 'Reserved' ? 'border-yellow-200 bg-yellow-50 hover:border-yellow-400 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:hover:border-yellow-500' : '',
						table.status === 'Cleaning' ? 'border-blue-200 bg-blue-50 hover:border-blue-400 dark:border-blue-900/50 dark:bg-blue-900/20 dark:hover:border-blue-500' : ''
					]"
					@click="selectTable(table)"
				>
					<!-- Status Indicator -->
					<div
						class="absolute top-2 right-2 w-3 h-3 rounded-full"
						:class="[
							table.status === 'Empty' ? 'bg-green-500' : '',
							table.status === 'Occupied' ? 'bg-red-500' : '',
							table.status === 'Reserved' ? 'bg-yellow-500' : '',
							table.status === 'Cleaning' ? 'bg-blue-500' : ''
						]"
					></div>

					<FeatherIcon name="coffee" class="w-8 h-8 mb-3 text-gray-700 dark:text-gray-300" />
					<span class="font-bold text-lg text-gray-900 dark:text-white text-center">{{ table.table_name }}</span>

					<div class="mt-2 text-xs font-medium px-2 py-1 rounded-full bg-white/60 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300">
						{{ table.capacity }} {{ __("Seats") }}
					</div>

					<span class="mt-1 text-xs text-gray-500 dark:text-gray-400 font-medium">
						{{ __(table.status) }}
					</span>
				</div>
			</div>

			<div v-if="filteredTables.length === 0" class="flex flex-col items-center justify-center h-full text-gray-500">
				<FeatherIcon name="grid" class="w-12 h-12 mb-4 text-gray-300" />
				<p>{{ __("No tables found in this area") }}</p>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue"
import { useRestaurantStore } from "@/stores/restaurant"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSDraftsStore } from "@/stores/posDrafts"
import { Button, FeatherIcon } from "frappe-ui"

const emit = defineEmits(["table-selected", "load-table-draft"])

const restaurantStore = useRestaurantStore()
const cartStore = usePOSCartStore()
const draftsStore = usePOSDraftsStore()

const selectedArea = ref(null)

const areas = computed(() => restaurantStore.areas)
const tables = computed(() => restaurantStore.tables)

const filteredTables = computed(() => {
	if (!selectedArea.value) return tables.value
	return tables.value.filter(t => t.area === selectedArea.value)
})

onMounted(async () => {
	await restaurantStore.loadTablesAndAreas()

	if (areas.value.length === 0 || tables.value.length === 0) {
		await restaurantStore.fetchFromNetwork()
	}

	if (areas.value.length > 0) {
		// Use default area if available, otherwise select first area
		if (restaurantStore.defaultArea) {
			selectedArea.value = restaurantStore.defaultArea
		} else {
			selectedArea.value = areas.value[0]?.name
		}
	}
})

const selectTable = async (table) => {
	cartStore.clearCart()

	await draftsStore.loadDrafts()
	const tableDraft = draftsStore.drafts.find(d => d.restaurant_table === table.name)

	if (tableDraft) {
		emit("load-table-draft", tableDraft)
	} else {
		cartStore.setRestaurantTable(table)

		if (table.status === "Empty") {
			await restaurantStore.updateTableStatus(table.name, "Occupied")
		}

		emit("table-selected", table)
	}
}
</script>

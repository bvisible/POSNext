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

					<!-- QR button (only for occupied tables when QR ordering is enabled) -->
					<button
						v-if="qrOrderingEnabled && table.status === 'Occupied'"
						@click.stop="showQRForTable(table)"
						class="absolute top-2 left-2 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
						:title="__('Show QR Code')"
					>
						<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/>
						</svg>
					</button>

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

	<!-- QR Code Modal -->
	<TableQRCode
		v-if="activeQR"
		:token="activeQR.token"
		:table-name="activeQR.tableName"
		:url="activeQR.url"
		@close="activeQR = null"
	/>
</template>

<script setup>
import { ref, computed, onMounted } from "vue"
import { useRestaurantStore } from "@/stores/restaurant"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSDraftsStore } from "@/stores/posDrafts"
import { Button, FeatherIcon } from "frappe-ui"
import TableQRCode from "@/components/restaurant/TableQRCode.vue"

const emit = defineEmits(["table-selected", "load-table-draft"])

const restaurantStore = useRestaurantStore()
const cartStore = usePOSCartStore()
const draftsStore = usePOSDraftsStore()

const selectedArea = ref(null)
const activeQR = ref(null) // { token, tableName, url }

const areas = computed(() => restaurantStore.areas)
const tables = computed(() => restaurantStore.tables)
const qrOrderingEnabled = computed(
	() => !!restaurantStore.restaurantSettings?.enable_qr_ordering,
)

const filteredTables = computed(() => {
	if (!selectedArea.value) return tables.value
	return tables.value.filter((t) => t.area === selectedArea.value)
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
	const tableDraft = draftsStore.drafts.find(
		(d) => d.restaurant_table === table.name,
	)

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

async function showQRForTable(table) {
	try {
		const response = await fetch(
			"/api/method/pos_next.api.guest_ordering.create_table_token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Frappe-CSRF-Token":
						window.csrf_token || window.frappe?.csrf_token || "",
				},
				body: JSON.stringify({
					table: table.name,
					pos_profile: restaurantStore.restaurantSettings?.pos_profile || null,
				}),
			},
		)
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		const data = await response.json()
		const result = data.message
		if (!result?.token) throw new Error("No token returned")

		const siteUrl = window.location.origin
		activeQR.value = {
			token: result.token,
			tableName: table.table_name,
			url: `${siteUrl}/pos/guest/${result.token}`,
		}
	} catch (err) {
		console.error("Failed to create table token:", err)
	}
}
</script>

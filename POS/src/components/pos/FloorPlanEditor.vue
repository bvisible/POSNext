<template>
	<div class="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
		<!-- Header: Area tabs + Edit toggle -->
		<div class="flex items-center justify-between px-4 py-2 border-b dark:border-gray-800">
			<!-- Area Tabs -->
			<div class="flex items-center gap-1 overflow-x-auto" v-if="areas.length > 1">
				<button
					v-for="area in areas"
					:key="area.name"
					@click="selectedArea = area.name"
					class="px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors"
					:class="selectedArea === area.name
						? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
						: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'"
				>
					{{ area.area_name }}
					<span
						v-if="occupiedCount(area.name) > 0"
						class="ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full"
					>
						{{ occupiedCount(area.name) }}
					</span>
				</button>
			</div>
			<div v-else class="text-sm font-medium text-gray-700 dark:text-gray-300">
				{{ __("Floor Plan") }}
			</div>

			<!-- Edit Mode Toggle -->
			<button
				@click="toggleEditMode"
				class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
				:class="isEditMode
					? 'bg-green-100 text-green-700 hover:bg-green-200'
					: 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path v-if="isEditMode" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					<path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
				</svg>
				{{ isEditMode ? __("Save") : __("Edit") }}
			</button>
		</div>

		<!-- Canvas -->
		<div
			ref="canvasRef"
			class="flex-1 relative overflow-hidden"
			:class="isEditMode ? 'bg-gray-50 dark:bg-gray-950' : 'bg-gray-100 dark:bg-gray-900'"
			:style="isEditMode ? 'background-image: radial-gradient(circle, #d1d5db 1px, transparent 1px); background-size: 20px 20px;' : ''"
		>
			<!-- Empty state -->
			<div v-if="filteredTables.length === 0 && !isEditMode" class="flex flex-col items-center justify-center h-full text-gray-400">
				<svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
				</svg>
				<p class="text-lg font-medium">{{ __("No tables in this area") }}</p>
				<p class="text-sm">{{ __("Switch to Edit mode to add tables") }}</p>
			</div>

			<!-- Tables -->
			<div
				v-for="table in filteredTables"
				:key="table.name"
				class="absolute flex flex-col items-center justify-center select-none transition-shadow duration-150"
				:class="[
					getTableClasses(table),
					isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer hover:shadow-lg',
				]"
				:style="getTableStyle(table)"
				@pointerdown="onTablePointerDown($event, table)"
			>
				<!-- Status dot -->
				<div
					class="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full"
					:class="{
						'bg-green-500': table.status === 'Empty',
						'bg-red-500': table.status === 'Occupied',
						'bg-yellow-500': table.status === 'Reserved',
						'bg-blue-500': table.status === 'Cleaning',
					}"
				/>

				<!-- Table info -->
				<span class="font-bold text-sm text-gray-900 dark:text-white leading-tight text-center">{{ table.table_name }}</span>
				<span class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{{ table.capacity }} {{ __("seats") }}</span>
				<span class="text-[10px] font-medium mt-0.5" :class="{
					'text-green-600': table.status === 'Empty',
					'text-red-600': table.status === 'Occupied',
					'text-yellow-600': table.status === 'Reserved',
					'text-blue-600': table.status === 'Cleaning',
				}">{{ __(table.status) }}</span>

				<!-- Resize handles (edit mode only) -->
				<template v-if="isEditMode">
					<div
						v-for="handle in ['nw', 'ne', 'sw', 'se']"
						:key="handle"
						class="absolute w-3 h-3 bg-blue-500 border border-white rounded-sm z-10"
						:class="{
							'top-0 left-0 cursor-nw-resize -translate-x-1/2 -translate-y-1/2': handle === 'nw',
							'top-0 right-0 cursor-ne-resize translate-x-1/2 -translate-y-1/2': handle === 'ne',
							'bottom-0 left-0 cursor-sw-resize -translate-x-1/2 translate-y-1/2': handle === 'sw',
							'bottom-0 right-0 cursor-se-resize translate-x-1/2 translate-y-1/2': handle === 'se',
						}"
						@pointerdown.stop="onResizePointerDown($event, table, handle)"
					/>
				</template>
			</div>

			<!-- Add Table Button (edit mode) -->
			<button
				v-if="isEditMode"
				@click="showAddTableDialog = true"
				class="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-colors z-20"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				{{ __("Add Table") }}
			</button>
		</div>

		<!-- Add Table Dialog -->
		<Dialog v-model="showAddTableDialog" :options="{ title: __('Add Table'), size: 'sm' }">
			<template #body-content>
				<div class="space-y-4 p-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Table Name") }}</label>
						<input v-model="newTable.table_name" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" :placeholder="__('e.g. Table 5')" />
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Capacity") }}</label>
						<input v-model.number="newTable.capacity" type="number" min="1" class="w-full px-3 py-2 border rounded-lg text-sm" />
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Shape") }}</label>
						<div class="flex gap-2">
							<button
								@click="newTable.shape = 'Square'"
								class="flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors"
								:class="newTable.shape === 'Square' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'"
							>{{ __("Square") }}</button>
							<button
								@click="newTable.shape = 'Round'"
								class="flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors"
								:class="newTable.shape === 'Round' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'"
							>{{ __("Round") }}</button>
						</div>
					</div>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showAddTableDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" @click="handleAddTable" :disabled="!newTable.table_name">{{ __("Add") }}</Button>
				</div>
			</template>
		</Dialog>
	</div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from "vue"
import { useRestaurantStore } from "@/stores/restaurant"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSDraftsStore } from "@/stores/posDrafts"
import { useDraggable } from "@/composables/useDraggable"
import { useToast } from "@/composables/useToast"
import { Button, Dialog } from "frappe-ui"

const emit = defineEmits(["table-selected", "load-table-draft"])

const restaurantStore = useRestaurantStore()
const cartStore = usePOSCartStore()
const draftsStore = usePOSDraftsStore()
const { showSuccess, showError } = useToast()

const canvasRef = ref(null)
const isEditMode = ref(false)
const selectedArea = ref(null)
const showAddTableDialog = ref(false)
const newTable = ref({ table_name: "", capacity: 4, shape: "Square" })

const areas = computed(() => restaurantStore.areas)
const tables = computed(() => restaurantStore.tables)

const filteredTables = computed(() => {
	if (!selectedArea.value) return tables.value
	return tables.value.filter(t => t.area === selectedArea.value)
})

function occupiedCount(areaName) {
	return restaurantStore.occupiedCountByArea[areaName] || 0
}

// Draggable composable
const { handleDragStart, handleResizeStart, destroy } = useDraggable({
	canvasRef,
	onDragEnd: (table) => {
		restaurantStore.updateTablePosition(table.name, table.pos_x, table.pos_y, table.width, table.height)
	},
	onResizeEnd: (table) => {
		restaurantStore.updateTablePosition(table.name, table.pos_x, table.pos_y, table.width, table.height)
	},
})

function getTableStyle(table) {
	const style = {
		left: `${table.pos_x || 0}px`,
		top: `${table.pos_y || 0}px`,
		width: `${table.width || 100}px`,
		height: `${table.height || 100}px`,
	}
	if (table.shape === "Round") {
		style.borderRadius = "50%"
	} else {
		style.borderRadius = "0.75rem"
	}
	return style
}

function getTableClasses(table) {
	if (isEditMode.value) {
		return "border-2 border-dashed border-blue-400 bg-white/90 dark:bg-gray-800/90 shadow-md"
	}
	const statusClasses = {
		Empty: "border-2 border-green-200 bg-green-50 hover:border-green-400 dark:bg-green-900/20 dark:border-green-800",
		Occupied: "border-2 border-red-200 bg-red-50 hover:border-red-400 dark:bg-red-900/20 dark:border-red-800",
		Reserved: "border-2 border-yellow-200 bg-yellow-50 hover:border-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-800",
		Cleaning: "border-2 border-blue-200 bg-blue-50 hover:border-blue-400 dark:bg-blue-900/20 dark:border-blue-800",
	}
	return statusClasses[table.status] || statusClasses.Empty
}

function onTablePointerDown(event, table) {
	if (isEditMode.value) {
		handleDragStart(event, table)
	} else {
		selectTable(table)
	}
}

function onResizePointerDown(event, table, handle) {
	handleResizeStart(event, table, handle)
}

async function selectTable(table) {
	// Clear cart and handle table draft/selection
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

async function toggleEditMode() {
	if (isEditMode.value) {
		// Save positions and exit edit mode
		try {
			await restaurantStore.saveAllPositions()
			showSuccess(__("Floor plan saved"))
		} catch (e) {
			showError(__("Failed to save floor plan"))
		}
		isEditMode.value = false
	} else {
		isEditMode.value = true
	}
}

async function handleAddTable() {
	if (!newTable.value.table_name) return

	try {
		await restaurantStore.addTable({
			table_name: newTable.value.table_name,
			area: selectedArea.value || areas.value[0]?.name,
			capacity: newTable.value.capacity,
			shape: newTable.value.shape,
			pos_x: 50,
			pos_y: 50,
		})
		showSuccess(__("Table added"))
		showAddTableDialog.value = false
		newTable.value = { table_name: "", capacity: 4, shape: "Square" }
	} catch (e) {
		showError(__("Failed to add table"))
	}
}

/**
 * Auto-layout tables in a grid when they have no positions set (all at 0,0).
 * Adds margin between each element until the user manually arranges them.
 */
function autoLayoutTables() {
	const tbls = filteredTables.value
	if (tbls.length < 2) return

	// Check if all tables are stacked at origin (no layout done yet)
	const allAtOrigin = tbls.every(t => !t.pos_x && !t.pos_y)
	if (!allAtOrigin) return

	const tableW = 110
	const tableH = 110
	const margin = 20
	const canvasW = canvasRef.value?.offsetWidth || 800
	const cols = Math.max(1, Math.floor(canvasW / (tableW + margin)))

	for (let i = 0; i < tbls.length; i++) {
		const col = i % cols
		const row = Math.floor(i / cols)
		tbls[i].pos_x = margin + col * (tableW + margin)
		tbls[i].pos_y = margin + row * (tableH + margin)
		if (!tbls[i].width) tbls[i].width = 100
		if (!tbls[i].height) tbls[i].height = 100
	}
}

onMounted(async () => {
	// Always fetch from network to get latest position fields
	await restaurantStore.fetchFromNetwork()

	// Select default area
	if (restaurantStore.defaultArea && areas.value.find(a => a.name === restaurantStore.defaultArea)) {
		selectedArea.value = restaurantStore.defaultArea
	} else if (areas.value.length > 0) {
		selectedArea.value = areas.value[0].name
	}

	// Auto-layout tables that have no positions yet
	await nextTick()
	autoLayoutTables()
})

// Re-layout when switching areas
watch(selectedArea, async () => {
	await nextTick()
	autoLayoutTables()
})

onUnmounted(() => {
	destroy()
})
</script>

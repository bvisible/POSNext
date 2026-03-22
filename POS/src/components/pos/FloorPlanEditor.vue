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
					:draggable="isEditMode"
					@dragstart="onAreaDragStart($event, area)"
					@dragover.prevent="onAreaDragOver($event, area)"
					@drop="onAreaDrop($event, area)"
					class="relative px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors"
					:class="[
						selectedArea === area.name
							? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
							: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800',
						isEditMode ? 'cursor-grab' : ''
					]"
				>
					{{ area.area_name }}
					<span
						v-if="occupiedCount(area.name) > 0"
						class="ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full"
					>
						{{ occupiedCount(area.name) }}
					</span>
				</button>

				<!-- Area management buttons (edit mode) - outside overflow container -->
				<template v-if="isEditMode && selectedArea">
					<button
						@click.stop="openRenameAreaDialog(areas.find(a => a.name === selectedArea))"
						class="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 transition-colors flex-shrink-0"
						:title="__('Rename area')"
					>
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
						</svg>
					</button>
					<button
						@click.stop="openDeleteAreaDialog(areas.find(a => a.name === selectedArea))"
						class="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors flex-shrink-0"
						:title="__('Delete area')"
					>
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</button>
				</template>

				<!-- Add Area Button (edit mode) -->
				<button
					v-if="isEditMode"
					@click="showAddAreaDialog = true"
					class="w-7 h-7 flex items-center justify-center rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors"
					:title="__('Add Area')"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
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
			:style="canvasBackgroundStyle"
		>
			<!-- Zoom controls -->
			<div class="absolute bottom-3 right-3 flex flex-col gap-1 z-20">
				<button
					@click="zoomIn"
					class="w-8 h-8 flex items-center justify-center bg-white/90 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-700 text-lg font-bold transition-colors"
					:title="__('Zoom in')"
				>+</button>
				<button
					v-if="zoomLevel !== 1"
					@click="zoomReset"
					class="w-8 h-8 flex items-center justify-center bg-white/90 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-500 text-[10px] font-medium transition-colors"
					:title="__('Reset zoom')"
				>{{ Math.round(zoomLevel * 100) }}%</button>
				<button
					@click="zoomOut"
					class="w-8 h-8 flex items-center justify-center bg-white/90 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 text-gray-700 text-lg font-bold transition-colors"
					:title="__('Zoom out')"
				>&minus;</button>
			</div>
			<!-- Empty state -->
			<div v-if="filteredTables.length === 0 && !isEditMode" class="flex flex-col items-center justify-center h-full text-gray-400">
				<svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
				</svg>
				<p class="text-lg font-medium">{{ __("No tables in this area") }}</p>
				<p class="text-sm">{{ __("Switch to Edit mode to add tables") }}</p>
			</div>

			<!-- Zoomable container -->
			<div :style="zoomContainerStyle" class="origin-top-left w-full h-full relative">

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
				<!-- Seats around table -->
				<div
					v-for="(seat, si) in getSeatPositions(table)"
					:key="'seat-' + si"
					class="absolute w-3.5 h-3.5 rounded-sm border-2 pointer-events-none"
					:class="table.status === 'Occupied' ? 'bg-gray-400 border-gray-500' : 'bg-white border-gray-300'"
					:style="seat"
				/>

				<!-- Status dot -->
				<div
					class="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full z-[5]"
					:class="{
						'bg-green-500': table.status === 'Empty',
						'bg-red-500': table.status === 'Occupied',
						'bg-yellow-500': table.status === 'Reserved',
						'bg-blue-500': table.status === 'Cleaning',
					}"
				/>

				<!-- Edit button (edit mode only) -->
				<button
					v-if="isEditMode"
					type="button"
					@pointerdown.stop
					@click.stop="openEditTableDialog(table)"
					class="absolute top-1 left-1 w-5 h-5 flex items-center justify-center rounded bg-white/80 hover:bg-blue-100 border border-gray-300 z-[5] cursor-pointer"
					:title="__('Edit table')"
				>
					<svg class="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
					</svg>
				</button>

				<!-- Table info -->
				<span class="font-bold text-sm text-gray-900 dark:text-white leading-tight text-center">{{ table.table_name }}</span>
				<template v-if="table.order_summary && !isEditMode">
					<div class="flex items-center gap-1 mt-0.5">
						<span class="text-[9px] font-semibold bg-red-100 text-red-700 px-1 rounded">{{ table.order_summary.item_count }}</span>
						<span class="text-[9px] text-gray-500">{{ formatTime(table.order_summary.opened_at) }}</span>
						<span class="text-[9px] font-bold text-blue-600">{{ table.order_summary.opened_by }}</span>
					</div>
				</template>
				<span v-else class="text-[10px] font-medium mt-0.5" :class="{
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

			<!-- Stations on floor plan -->
			<div
				v-for="station in filteredStations"
				:key="'station-' + station.name"
				class="absolute flex flex-col items-center justify-center select-none transition-shadow duration-150 rounded-lg"
				:class="isEditMode ? 'cursor-grab active:cursor-grabbing border-2 border-dashed' : 'cursor-pointer hover:shadow-lg border-2'"
				:style="{
					left: (station.pos_x || 0) + 'px',
					top: (station.pos_y || 0) + 'px',
					width: (station.width || 120) + 'px',
					height: (station.height || 60) + 'px',
					backgroundColor: (station.color || '#6B7280') + '20',
					borderColor: station.color || '#6B7280',
				}"
				@pointerdown="isEditMode ? handleDragStart($event, station) : null"
				@click="!isEditMode ? openStationKDS(station) : null"
			>
				<!-- Station icon -->
				<svg v-if="station.station_type === 'Kitchen'" class="w-5 h-5 mb-0.5" :style="{color: station.color}" fill="currentColor" viewBox="0 0 24 24">
					<path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>
				</svg>
				<svg v-else class="w-5 h-5 mb-0.5" :style="{color: station.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
				</svg>
				<span class="text-xs font-bold" :style="{color: station.color}">{{ station.station_name }}</span>

				<!-- Resize handles (edit mode) -->
				<template v-if="isEditMode">
					<div
						v-for="handle in ['nw', 'ne', 'sw', 'se']"
						:key="handle"
						class="absolute w-3 h-3 border border-white rounded-sm z-10"
						:style="{backgroundColor: station.color || '#6B7280'}"
						:class="{
							'top-0 left-0 cursor-nw-resize -translate-x-1/2 -translate-y-1/2': handle === 'nw',
							'top-0 right-0 cursor-ne-resize translate-x-1/2 -translate-y-1/2': handle === 'ne',
							'bottom-0 left-0 cursor-sw-resize -translate-x-1/2 translate-y-1/2': handle === 'sw',
							'bottom-0 right-0 cursor-se-resize translate-x-1/2 translate-y-1/2': handle === 'se',
						}"
						@pointerdown.stop="onResizePointerDown($event, station, handle)"
					/>
				</template>
			</div>

			</div><!-- /Zoomable container -->

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

		<!-- Edit Table Dialog -->
		<Dialog v-model="showEditTableDialog" :options="{ title: __('Edit Table'), size: 'sm' }">
			<template #body-content>
				<div class="space-y-4 p-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Table Name") }}</label>
						<input v-model="editTable.table_name" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" />
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Capacity") }}</label>
						<input v-model.number="editTable.capacity" type="number" min="1" class="w-full px-3 py-2 border rounded-lg text-sm" />
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Shape") }}</label>
						<div class="flex gap-2">
							<button
								@click="editTable.shape = 'Square'"
								class="flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors"
								:class="editTable.shape === 'Square' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'"
							>{{ __("Square") }}</button>
							<button
								@click="editTable.shape = 'Round'"
								class="flex-1 py-2 text-sm font-medium rounded-lg border-2 transition-colors"
								:class="editTable.shape === 'Round' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'"
							>{{ __("Round") }}</button>
						</div>
					</div>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showEditTableDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" @click="handleEditTable">{{ __("Save") }}</Button>
				</div>
			</template>
		</Dialog>

		<!-- Add Area Dialog -->
		<Dialog v-model="showAddAreaDialog" :options="{ title: __('Add Area'), size: 'sm' }">
			<template #body-content>
				<div class="space-y-4 p-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Area Name") }}</label>
						<input v-model="newAreaName" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" :placeholder="__('e.g. Main Hall')" />
					</div>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showAddAreaDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" @click="handleAddArea" :disabled="!newAreaName.trim()">{{ __("Add") }}</Button>
				</div>
			</template>
		</Dialog>

		<!-- Rename Area Dialog -->
		<Dialog v-model="showRenameAreaDialog" :options="{ title: __('Rename Area'), size: 'sm' }">
			<template #body-content>
				<div class="space-y-4 p-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Area Name") }}</label>
						<input v-model="editAreaName" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" />
					</div>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showRenameAreaDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" @click="handleRenameArea" :disabled="!editAreaName.trim()">{{ __("Save") }}</Button>
				</div>
			</template>
		</Dialog>

		<!-- Delete Area Dialog -->
		<Dialog v-model="showDeleteAreaDialog" :options="{ title: __('Delete Area'), size: 'sm' }">
			<template #body-content>
				<div class="space-y-4 p-4">
					<p class="text-gray-700">{{ __("Are you sure you want to delete this area?") }}</p>
				</div>
			</template>
			<template #actions>
				<div class="flex gap-2 w-full">
					<Button class="flex-1" variant="subtle" @click="showDeleteAreaDialog = false">{{ __("Cancel") }}</Button>
					<Button class="flex-1" variant="solid" theme="red" @click="handleDeleteArea">{{ __("Delete") }}</Button>
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
import { call } from "@/utils/apiWrapper"
import { initSocket } from "@/socket"
import { Button, Dialog } from "frappe-ui"

const emit = defineEmits(["table-selected", "load-table-draft", "load-server-draft"])

const restaurantStore = useRestaurantStore()
const cartStore = usePOSCartStore()
const draftsStore = usePOSDraftsStore()
let floorSocket = null
const { showSuccess, showError } = useToast()

const canvasRef = ref(null)
const isEditMode = ref(false)
const ZOOM_STORAGE_KEY = "pos_next_floor_zoom"
const savedZoom = parseFloat(localStorage.getItem(ZOOM_STORAGE_KEY)) || 1
const zoomLevel = ref(Math.max(0.4, Math.min(2, savedZoom)))

const ZOOM_STEP = 0.15
const ZOOM_MIN = 0.4
const ZOOM_MAX = 2

function saveZoom() {
	localStorage.setItem(ZOOM_STORAGE_KEY, zoomLevel.value.toString())
}
function zoomIn() {
	zoomLevel.value = Math.min(ZOOM_MAX, +(zoomLevel.value + ZOOM_STEP).toFixed(2))
	saveZoom()
}
function zoomOut() {
	zoomLevel.value = Math.max(ZOOM_MIN, +(zoomLevel.value - ZOOM_STEP).toFixed(2))
	saveZoom()
}
function zoomReset() {
	zoomLevel.value = 1
	saveZoom()
}

const zoomContainerStyle = computed(() => ({
	transform: `scale(${zoomLevel.value})`,
	transformOrigin: "top left",
}))

const canvasBackgroundStyle = computed(() => {
	const gridSize = isEditMode.value ? 20 : 25
	const dotColor = isEditMode.value ? "#d1d5db" : "#cbd5e1"
	const dotSize = isEditMode.value ? "1px" : "1px"
	const bg = isEditMode.value ? "#f9fafb" : "#f8fafc"
	return {
		backgroundColor: bg,
		backgroundImage: `radial-gradient(circle, ${dotColor} ${dotSize}, transparent ${dotSize})`,
		backgroundSize: `${gridSize}px ${gridSize}px`,
	}
})
const selectedArea = ref(null)
const showAddTableDialog = ref(false)
const newTable = ref({ table_name: "", capacity: 4, shape: "Square" })
const showEditTableDialog = ref(false)
const editTable = ref({ name: "", table_name: "", capacity: 4, shape: "Square" })
const showAddAreaDialog = ref(false)
const showRenameAreaDialog = ref(false)
const showDeleteAreaDialog = ref(false)
const newAreaName = ref("")
const editAreaName = ref("")
const areaToRename = ref(null)
const areaToDelete = ref(null)
const draggedArea = ref(null)

const areas = computed(() => restaurantStore.areas)

// Local reactive copy of tables for rendering — mutations here trigger re-render
const localTables = ref([])

function syncLocalTables() {
	localTables.value = restaurantStore.tables.map(t => ({ ...t }))
}

// Local reactive copy of stations for rendering
const localStations = ref([])

function syncLocalStations() {
	localStations.value = (restaurantStore.floorStations || []).map(s => ({ ...s }))
}

// Keep local copies in sync when store data changes
watch(() => restaurantStore.tables, syncLocalTables, { deep: true })
watch(() => restaurantStore.floorStations, syncLocalStations, { deep: true })

const filteredTables = computed(() => {
	if (!selectedArea.value) return localTables.value
	return localTables.value.filter(t => t.area === selectedArea.value)
})

const filteredStations = computed(() => {
	if (!selectedArea.value) return localStations.value
	return localStations.value.filter(s => s.area === selectedArea.value)
})

function occupiedCount(areaName) {
	return restaurantStore.occupiedCountByArea[areaName] || 0
}

// Draggable composable
const { handleDragStart, handleResizeStart, destroy } = useDraggable({
	canvasRef,
	onDragEnd: (obj) => {
		// Check if this is a station or table
		if (obj.station_name) {
			const storeStation = restaurantStore.floorStations.find(s => s.name === obj.name)
			if (storeStation) Object.assign(storeStation, { pos_x: obj.pos_x, pos_y: obj.pos_y })
			restaurantStore.updateStationPosition(obj.name, obj.pos_x, obj.pos_y, obj.width, obj.height)
		} else {
			const storeTable = restaurantStore.tables.find(t => t.name === obj.name)
			if (storeTable) Object.assign(storeTable, { pos_x: obj.pos_x, pos_y: obj.pos_y })
			restaurantStore.updateTablePosition(obj.name, obj.pos_x, obj.pos_y, obj.width, obj.height)
		}
	},
	onResizeEnd: (obj) => {
		// Check if this is a station or table
		if (obj.station_name) {
			const storeStation = restaurantStore.floorStations.find(s => s.name === obj.name)
			if (storeStation) Object.assign(storeStation, { pos_x: obj.pos_x, pos_y: obj.pos_y, width: obj.width, height: obj.height })
			restaurantStore.updateStationPosition(obj.name, obj.pos_x, obj.pos_y, obj.width, obj.height)
		} else {
			const storeTable = restaurantStore.tables.find(t => t.name === obj.name)
			if (storeTable) Object.assign(storeTable, { pos_x: obj.pos_x, pos_y: obj.pos_y, width: obj.width, height: obj.height })
			restaurantStore.updateTablePosition(obj.name, obj.pos_x, obj.pos_y, obj.width, obj.height)
		}
	},
})

/**
 * Calculate seat positions around a table.
 * For round tables: seats are distributed in a circle.
 * For square tables: seats are distributed along the 4 sides.
 */
function getSeatPositions(table) {
	const count = table.capacity || 4
	const w = table.width || 100
	const h = table.height || 100
	const seatSize = 14 // 3.5 tailwind = 14px
	// Border width of the table element (border-2 = 2px)
	// Absolute children are positioned relative to the padding box,
	// so we need to offset by -border to reach the visual outer edge
	const b = 2

	if (table.shape === "Round") {
		const seats = []
		const cx = (w - 2 * b) / 2
		const cy = (h - 2 * b) / 2
		const rx = w / 2
		const ry = h / 2
		for (let i = 0; i < count; i++) {
			const angle = (2 * Math.PI * i) / count - Math.PI / 2
			seats.push({
				left: `${cx + rx * Math.cos(angle)}px`,
				top: `${cy + ry * Math.sin(angle)}px`,
				transform: 'translate(-50%, -50%)',
			})
		}
		return seats
	}

	// Square table: distribute seats along sides
	const seats = []
	// Split seats across 4 sides: top, right, bottom, left
	const sides = [[], [], [], []] // top, right, bottom, left
	for (let i = 0; i < count; i++) {
		sides[i % 4].push(i)
	}

	// All seats use transform to center on the visual outer edge
	// Absolute children are positioned from the padding box, so we offset by -b to reach the border edge
	const t = 'translate(-50%, -50%)'
	const innerW = w - 2 * b // padding box width
	const innerH = h - 2 * b // padding box height

	// Top side — visual outer edge is at top: -b
	sides[0].forEach((_, idx) => {
		const x = innerW / (sides[0].length + 1) * (idx + 1)
		seats.push({ left: `${x}px`, top: `${-b}px`, transform: t })
	})
	// Bottom side — visual outer edge is at top: innerH + b
	sides[2].forEach((_, idx) => {
		const x = innerW / (sides[2].length + 1) * (idx + 1)
		seats.push({ left: `${x}px`, top: `${innerH + b}px`, transform: t })
	})
	// Left side — visual outer edge is at left: -b
	sides[3].forEach((_, idx) => {
		const y = innerH / (sides[3].length + 1) * (idx + 1)
		seats.push({ left: `${-b}px`, top: `${y}px`, transform: t })
	})
	// Right side — visual outer edge is at left: innerW + b
	sides[1].forEach((_, idx) => {
		const y = innerH / (sides[1].length + 1) * (idx + 1)
		seats.push({ left: `${innerW + b}px`, top: `${y}px`, transform: t })
	})

	return seats
}

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

function formatTime(dateStr) {
	if (!dateStr) return ""
	try {
		const d = new Date(dateStr)
		return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
	} catch {
		return ""
	}
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

function openStationKDS(station) {
	// Open KDS page filtered by this station in a new tab
	const url = `/pos/kds?station=${encodeURIComponent(station.name)}`
	window.open(url, '_blank')
}

async function selectTable(table) {
	// Clear cart before loading table (await to ensure cleanup completes)
	await cartStore.clearCart()
	cartStore.setRestaurantTable(table)

	// Check for existing server-side draft invoice for this table
	try {
		const res = await call("pos_next.api.restaurant.get_table_order", {
			table_name: table.name
		})
		if (res && res.name && res.items && res.items.length > 0) {
			// Load items from server draft directly into cart
			for (const item of res.items) {
				cartStore.addItem({
					item_code: item.item_code,
					item_name: item.item_name,
					rate: item.rate,
					uom: item.uom,
					image: item.image,
					preparation_station: item.preparation_station,
					posa_special_instructions: item.posa_special_instructions,
					posa_item_modifiers: item.posa_item_modifiers,
					kds_status: item.kds_status || "Pending",
				}, item.qty || 1)
			}
			// Set draft ID and KDS status
			cartStore.$patch({
				currentDraftId: res.name,
				kdsStatus: res.kds_status || "Pending",
				hasUnsentChanges: false,
			})
			if (res.customer) cartStore.setCustomer(res.customer)
			return
		}
	} catch (e) {
		console.error("[FloorPlan] Failed to load table order:", e)
	}

	// No server draft — open table normally
	if (table.status === "Empty") {
		await restaurantStore.updateTableStatus(table.name, "Occupied")
	}
	emit("table-selected", table)
}

async function toggleEditMode() {
	if (isEditMode.value) {
		// Save positions and exit edit mode
		try {
			await restaurantStore.saveAllPositions()
			if (restaurantStore.floorStations.length > 0) {
				await restaurantStore.saveStationPositions()
			}
			showSuccess(__("Floor plan saved"))
		} catch (e) {
			showError(__("Failed to save floor plan"))
		}
		isEditMode.value = false
	} else {
		isEditMode.value = true
	}
}

function onAreaDragStart(event, area) {
	if (!isEditMode.value) return
	draggedArea.value = area.name
	event.dataTransfer.effectAllowed = 'move'
}

function onAreaDragOver(event, area) {
	if (!isEditMode.value || !draggedArea.value) return
	event.dataTransfer.dropEffect = 'move'
}

async function onAreaDrop(event, targetArea) {
	if (!isEditMode.value || !draggedArea.value || draggedArea.value === targetArea.name) {
		draggedArea.value = null
		return
	}

	const names = areas.value.map(a => a.name)
	const fromIdx = names.indexOf(draggedArea.value)
	const toIdx = names.indexOf(targetArea.name)
	if (fromIdx === -1 || toIdx === -1) return

	names.splice(fromIdx, 1)
	names.splice(toIdx, 0, draggedArea.value)

	await restaurantStore.reorderAreas(names)
	draggedArea.value = null
}

async function handleAddTable() {
	if (!newTable.value.table_name) return
	try {
		// Calculate position: center of visible canvas area
		const canvas = canvasRef.value
		const pos_x = canvas ? Math.round((canvas.clientWidth / 2) - 50) : 200
		const pos_y = canvas ? Math.round((canvas.clientHeight / 2) - 50) : 200

		await restaurantStore.addTable({
			table_name: newTable.value.table_name,
			area: selectedArea.value,
			capacity: newTable.value.capacity || 4,
			shape: newTable.value.shape || "Square",
			pos_x,
			pos_y,
		})
		showAddTableDialog.value = false
		newTable.value = { table_name: "", capacity: 4, shape: "Square" }
		syncLocalTables()
		showSuccess(__("Table added"))
	} catch (error) {
		showError(__("Failed to add table"))
	}
}

function openEditTableDialog(table) {
	editTable.value = {
		name: table.name,
		table_name: table.table_name,
		capacity: table.capacity || 4,
		shape: table.shape || "Square",
	}
	showEditTableDialog.value = true
}

async function handleEditTable() {
	if (!editTable.value.name) return
	try {
		await call("pos_next.api.restaurant.create_table", {
			table_name: editTable.value.table_name,
			area: selectedArea.value,
			capacity: editTable.value.capacity,
			shape: editTable.value.shape,
		})
		showEditTableDialog.value = false
		await restaurantStore.fetchFromNetwork()
		syncLocalTables()
		showSuccess(__("Table updated"))
	} catch (error) {
		showError(__("Failed to update table"))
	}
}

async function handleAddArea() {
	if (!newAreaName.value.trim()) return

	try {
		await restaurantStore.createArea(newAreaName.value.trim())
		syncLocalTables()
		syncLocalStations()
		showSuccess(__("Area created"))
		showAddAreaDialog.value = false
		newAreaName.value = ""
	} catch (e) {
		showError(__("Failed to create area"))
	}
}

function openRenameAreaDialog(area) {
	areaToRename.value = area
	editAreaName.value = area.area_name
	showRenameAreaDialog.value = true
}

async function handleRenameArea() {
	if (!editAreaName.value.trim() || !areaToRename.value) return

	try {
		await restaurantStore.renameArea(areaToRename.value.name, editAreaName.value.trim())
		syncLocalTables()
		syncLocalStations()
		showSuccess(__("Area renamed"))
		showRenameAreaDialog.value = false
		areaToRename.value = null
		editAreaName.value = ""
	} catch (e) {
		showError(__("Failed to rename area"))
	}
}

function openDeleteAreaDialog(area) {
	areaToDelete.value = area
	showDeleteAreaDialog.value = true
}

async function handleDeleteArea() {
	if (!areaToDelete.value) return

	try {
		await restaurantStore.deleteArea(areaToDelete.value.name)
		syncLocalTables()
		syncLocalStations()
		if (selectedArea.value === areaToDelete.value.name && areas.value.length > 0) {
			selectedArea.value = areas.value[0].name
		}
		showSuccess(__("Area deleted"))
		showDeleteAreaDialog.value = false
		areaToDelete.value = null
	} catch (e) {
		showError(__("Failed to delete area"))
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

	// Force Vue to re-render by reassigning localTables
	localTables.value = [...localTables.value]
}

onMounted(async () => {
	// Always fetch from network to get latest position fields
	await restaurantStore.fetchFromNetwork()

	// Create local reactive copies
	syncLocalTables()
	syncLocalStations()

	// Select default area
	if (restaurantStore.defaultArea && areas.value.find(a => a.name === restaurantStore.defaultArea)) {
		selectedArea.value = restaurantStore.defaultArea
	} else if (areas.value.length > 0) {
		selectedArea.value = areas.value[0].name
	}

	// Auto-layout tables that have no positions yet
	await nextTick()
	autoLayoutTables()

	// Listen for realtime table updates
	floorSocket = initSocket()
	if (floorSocket) {
		if (floorSocket.disconnected) floorSocket.connect()
		floorSocket.on("table_update", () => {
			restaurantStore.fetchFromNetwork()
		})
	}
})

// Re-layout when switching areas
watch(selectedArea, async () => {
	await nextTick()
	autoLayoutTables()
})

onUnmounted(() => {
	if (floorSocket) {
		floorSocket.off("table_update")
	}
	destroy()
})
</script>

<template>
	<div class="fp-wrap">
		<!-- Area tabs + Zoom controls -->
		<div class="fp-header">
			<div v-if="floorAreas.length > 1" class="fp-area-tabs">
				<button
					v-for="area in floorAreas"
					:key="area"
					class="fp-area-tab"
					:class="{ active: localArea === area }"
					@click="localArea = area"
				>
					{{ area }}
				</button>
			</div>
			<div class="fp-controls" data-gesture-ignore>
				<button class="fp-zoom-btn" @click="zoomIn">+</button>
				<button class="fp-zoom-btn" @click="zoomOut">&minus;</button>
			</div>
		</div>

		<!-- Canvas -->
		<div class="fp-canvas" ref="canvasRef" style="touch-action: none;">
			<div
				:style="[gestureTransformStyle, { position: 'relative', width: canvasWidth + 'px', height: canvasHeight + 'px' }]"
			>
				<!-- Read-only walls -->
				<FloorPlanWalls
					:walls="areaWalls.walls"
					:doors="areaWalls.doors"
					:windows="areaWalls.windows"
					:is-edit-mode="false"
				/>
				<div
					v-for="table in visibleTables"
					:key="table.name"
					class="fp-table"
					:class="[
						selectedTables.includes(table.name) ? 'fp-selected' : '',
						table.available ? 'fp-available' : 'fp-unavailable',
					]"
					:style="tableStyle(table)"
					@click="$emit('toggle-table', table)"
				>
					<span class="fp-table-name">{{ table.table_name }}</span>
					<span class="fp-table-cap">{{ table.capacity }}p</span>
				</div>
			</div>
		</div>

		<!-- Legend -->
		<div class="fp-legend">
			<span class="fp-legend-item">
				<span class="fp-dot fp-dot-available" />{{ __("Free") }}
			</span>
			<span class="fp-legend-item">
				<span class="fp-dot fp-dot-unavailable" />{{ __("Taken") }}
			</span>
			<span class="fp-legend-item">
				<span class="fp-dot fp-dot-selected" />{{ __("Selected") }}
			</span>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, watch } from "vue"
import { useCanvasGestures } from "@/composables/useCanvasGestures"
import FloorPlanWalls from "@/components/pos/FloorPlanWalls.vue"

const props = defineProps({
	tables: { type: Array, default: () => [] },
	selectedTables: { type: Array, default: () => [] },
	selectedArea: { type: String, default: "" },
	areas: { type: Array, default: () => [] },
})

defineEmits(["toggle-table"])

const canvasRef = ref(null)

const {
	zoomLevel: zoom,
	transformStyle: gestureTransformStyle,
	zoomIn,
	zoomOut,
	resetPan,
} = useCanvasGestures({
	containerRef: canvasRef,
	initialZoom: 0.7,
	zoomMin: 0.3,
	zoomMax: 1.5,
	isEditMode: ref(false),
})

// Areas available in the floor plan
const floorAreas = computed(() => {
	return [
		...new Set(
			props.tables.filter((t) => t.pos_x || t.pos_y).map((t) => t.area),
		),
	].sort()
})

// Local area state — syncs with parent selectedArea or defaults to first
const localArea = ref("")

watch(
	() => props.selectedArea,
	(val) => {
		if (val) localArea.value = val
	},
	{ immediate: true },
)

watch(
	floorAreas,
	(areas) => {
		if (!localArea.value && areas.length > 0) {
			localArea.value = areas[0]
		}
	},
	{ immediate: true },
)

watch(localArea, () => {
	resetPan()
})

const visibleTables = computed(() => {
	const list = props.tables.filter((t) => t.pos_x || t.pos_y)
	if (!localArea.value) return list
	return list.filter((t) => t.area === localArea.value)
})

const canvasWidth = computed(() => {
	if (!visibleTables.value.length) return 400
	return (
		Math.max(
			...visibleTables.value.map((t) => (t.pos_x || 0) + (t.width || 100)),
		) + 40
	)
})

const canvasHeight = computed(() => {
	if (!visibleTables.value.length) return 300
	return (
		Math.max(
			...visibleTables.value.map((t) => (t.pos_y || 0) + (t.height || 100)),
		) + 40
	)
})

// Walls data from area (read-only)
const areaWalls = computed(() => {
	const area = props.areas.find((a) => a.name === localArea.value)
	if (!area?.floor_plan_walls) return { walls: [], doors: [], windows: [] }
	try {
		const data = typeof area.floor_plan_walls === "string"
			? JSON.parse(area.floor_plan_walls)
			: area.floor_plan_walls
		return { walls: data.walls || [], doors: data.doors || [], windows: data.windows || [] }
	} catch { return { walls: [], doors: [], windows: [] } }
})

function tableStyle(table) {
	return {
		left: `${table.pos_x || 0}px`,
		top: `${table.pos_y || 0}px`,
		width: `${table.width || 100}px`,
		height: `${table.height || 100}px`,
		borderRadius: table.shape === "Round" ? "50%" : "0.75rem",
	}
}
</script>

<style scoped>
.fp-wrap {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.fp-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.fp-area-tabs {
	display: flex;
	gap: 4px;
	flex-wrap: wrap;
}

.fp-area-tab {
	padding: 4px 10px;
	border-radius: 6px;
	border: 1px solid var(--border-color, #d1d5db);
	background: var(--control-bg, #fff);
	cursor: pointer;
	font-size: 12px;
	font-weight: 500;
	transition: all 0.15s;
}

.fp-area-tab.active {
	background: var(--gray-800, #1f2937);
	border-color: var(--gray-800, #1f2937);
	color: #fff;
}

.fp-controls {
	display: flex;
	gap: 4px;
	flex-shrink: 0;
}

.fp-zoom-btn {
	width: 28px;
	height: 28px;
	border-radius: 6px;
	border: 1px solid var(--border-color, #d1d5db);
	background: var(--control-bg, #fff);
	font-size: 16px;
	font-weight: 600;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
}

.fp-canvas {
	overflow: hidden;
	border: 1px solid var(--border-color, #e5e7eb);
	border-radius: 8px;
	background: var(--gray-50, #f9fafb);
	height: 280px;
}

.fp-table {
	position: absolute;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	border: 2px solid;
	cursor: pointer;
	transition: all 0.15s;
	gap: 2px;
}

.fp-available {
	border-color: var(--green-400, #4ade80);
	background: var(--green-50, #f0fdf4);
}

.fp-available:hover {
	background: var(--green-100, #dcfce7);
	border-color: var(--green-500, #22c55e);
}

.fp-unavailable {
	border-color: var(--gray-300, #d1d5db);
	background: var(--gray-100, #f3f4f6);
	opacity: 0.5;
}

.fp-unavailable:hover {
	opacity: 0.7;
}

.fp-selected {
	border-color: var(--blue-500, #d68a59) !important;
	background: var(--blue-100, #dbeafe) !important;
	opacity: 1 !important;
	box-shadow: 0 0 0 2px rgba(214, 138, 89, 0.3);
}

.fp-table-name {
	font-size: 11px;
	font-weight: 600;
	color: var(--heading-color, #111827);
	white-space: nowrap;
}

.fp-table-cap {
	font-size: 9px;
	color: var(--text-muted, #6b7280);
}

.fp-legend {
	display: flex;
	gap: 12px;
	justify-content: center;
}

.fp-legend-item {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 11px;
	color: var(--text-muted, #6b7280);
}

.fp-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	border: 2px solid;
}

.fp-dot-available {
	border-color: var(--green-400, #4ade80);
	background: var(--green-50, #f0fdf4);
}

.fp-dot-unavailable {
	border-color: var(--gray-300, #d1d5db);
	background: var(--gray-100, #f3f4f6);
}

.fp-dot-selected {
	border-color: var(--blue-500, #d68a59);
	background: var(--blue-100, #dbeafe);
}
</style>

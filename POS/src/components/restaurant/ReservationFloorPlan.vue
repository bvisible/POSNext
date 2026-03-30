<template>
	<div class="fp-wrap">
		<!-- Zoom controls -->
		<div class="fp-controls">
			<button class="fp-zoom-btn" @click="zoom = Math.min(1.5, zoom + 0.15)">+</button>
			<button class="fp-zoom-btn" @click="zoom = Math.max(0.3, zoom - 0.15)">&minus;</button>
		</div>

		<!-- Canvas -->
		<div class="fp-canvas">
			<div
				:style="{
					transform: `scale(${zoom})`,
					transformOrigin: 'top left',
					position: 'relative',
					width: canvasWidth + 'px',
					height: canvasHeight + 'px',
				}"
			>
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
import { ref, computed } from "vue"

const props = defineProps({
	tables: { type: Array, default: () => [] },
	selectedTables: { type: Array, default: () => [] },
	selectedArea: { type: String, default: "" },
})

defineEmits(["toggle-table"])

const zoom = ref(0.7)

const visibleTables = computed(() => {
	const list = props.tables.filter((t) => t.pos_x || t.pos_y)
	if (!props.selectedArea) return list
	return list.filter((t) => t.area === props.selectedArea)
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

.fp-controls {
	position: absolute;
	top: 4px;
	right: 4px;
	display: flex;
	gap: 4px;
	z-index: 10;
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
	overflow: auto;
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
	border-color: var(--blue-500, #3b82f6) !important;
	background: var(--blue-100, #dbeafe) !important;
	opacity: 1 !important;
	box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
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
	border-color: var(--blue-500, #3b82f6);
	background: var(--blue-100, #dbeafe);
}
</style>

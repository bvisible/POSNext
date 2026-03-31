<template>
	<svg
		class="absolute inset-0 pointer-events-none overflow-visible"
		:class="{ 'pointer-events-auto': isEditMode && activeTool !== 'select' }"
		width="100%" height="100%"
		@pointerdown="onCanvasPointerDown"
		@pointermove="onCanvasPointerMove"
		@pointerup="onCanvasPointerUp"
	>
		<!-- Walls -->
		<template v-for="wall in walls" :key="wall.id">
			<!-- Wall segments (split around doors/windows) -->
			<template v-for="(seg, si) in getWallSegments(wall)" :key="wall.id + '-seg-' + si">
				<line
					:x1="seg.x1" :y1="seg.y1" :x2="seg.x2" :y2="seg.y2"
					:stroke="selectedId === wall.id ? '#3B82F6' : '#374151'"
					stroke-width="4" stroke-linecap="round"
				/>
			</template>
			<!-- Hit area for selection (wider invisible line) -->
			<line v-if="isEditMode && activeTool === 'select'"
				:x1="wall.x1" :y1="wall.y1" :x2="wall.x2" :y2="wall.y2"
				stroke="transparent" stroke-width="16" class="cursor-pointer pointer-events-auto"
				@pointerdown.stop="selectElement(wall.id)"
			/>
			<!-- Endpoint handles in edit mode -->
			<template v-if="isEditMode && selectedId === wall.id && activeTool === 'select'">
				<circle :cx="wall.x1" :cy="wall.y1" r="5" fill="#3B82F6" stroke="white" stroke-width="2"
					class="cursor-move pointer-events-auto" @pointerdown.stop="startDragEndpoint($event, wall, 'start')" />
				<circle :cx="wall.x2" :cy="wall.y2" r="5" fill="#3B82F6" stroke="white" stroke-width="2"
					class="cursor-move pointer-events-auto" @pointerdown.stop="startDragEndpoint($event, wall, 'end')" />
			</template>
		</template>

		<!-- Doors -->
		<template v-for="door in doors" :key="door.id">
			<g v-if="getDoorGeometry(door)" @pointerdown.stop="isEditMode && activeTool === 'select' && selectElement(door.id)">
				<path :d="getDoorGeometry(door).arc" stroke="#6B7280" stroke-width="1.5" fill="none"
					:class="isEditMode && activeTool === 'select' ? 'pointer-events-auto cursor-pointer' : ''" />
				<line :x1="getDoorGeometry(door).leaf.x1" :y1="getDoorGeometry(door).leaf.y1"
					:x2="getDoorGeometry(door).leaf.x2" :y2="getDoorGeometry(door).leaf.y2"
					stroke="#6B7280" stroke-width="2"
					:class="isEditMode && activeTool === 'select' ? 'pointer-events-auto cursor-pointer' : ''" />
				<!-- Selected highlight -->
				<circle v-if="selectedId === door.id" :cx="getDoorGeometry(door).center.x" :cy="getDoorGeometry(door).center.y"
					r="6" fill="none" stroke="#3B82F6" stroke-width="2" stroke-dasharray="3,2" />
			</g>
		</template>

		<!-- Windows -->
		<template v-for="win in windows" :key="win.id">
			<g v-if="getWindowGeometry(win)" @pointerdown.stop="isEditMode && activeTool === 'select' && selectElement(win.id)">
				<template v-for="(seg, si) in getWindowGeometry(win).lines" :key="win.id + '-wl-' + si">
					<line :x1="seg.x1" :y1="seg.y1" :x2="seg.x2" :y2="seg.y2"
						stroke="#93C5FD" stroke-width="2.5"
						:class="isEditMode && activeTool === 'select' ? 'pointer-events-auto cursor-pointer' : ''" />
				</template>
				<circle v-if="selectedId === win.id" :cx="getWindowGeometry(win).center.x" :cy="getWindowGeometry(win).center.y"
					r="6" fill="none" stroke="#3B82F6" stroke-width="2" stroke-dasharray="3,2" />
			</g>
		</template>

		<!-- Drawing preview (wall being drawn) -->
		<line v-if="drawPreview"
			:x1="drawPreview.x1" :y1="drawPreview.y1" :x2="drawPreview.x2" :y2="drawPreview.y2"
			stroke="#3B82F6" stroke-width="3" stroke-dasharray="6,4" stroke-linecap="round" opacity="0.7"
		/>

		<!-- Door/window placement preview -->
		<circle v-if="placementPreview"
			:cx="placementPreview.x" :cy="placementPreview.y"
			r="4" fill="#3B82F6" opacity="0.6"
		/>
	</svg>
</template>

<script setup>
import { ref, computed, toRefs } from "vue"

const props = defineProps({
	walls: { type: Array, default: () => [] },
	doors: { type: Array, default: () => [] },
	windows: { type: Array, default: () => [] },
	isEditMode: { type: Boolean, default: false },
	activeTool: { type: String, default: "select" },
	zoomLevel: { type: Number, default: 1 },
})

const emit = defineEmits([
	"update:walls", "update:doors", "update:windows",
	"select", "add-wall", "add-door", "add-window",
])

const { walls, doors, windows } = toRefs(props)

const selectedId = ref(null)
const drawPreview = ref(null)
const placementPreview = ref(null)
let drawStart = null
let dragState = null

const GRID = 10
const SNAP_DISTANCE = 15

// ── Helpers ──────────────────────────────────────────────

function snap(v) {
	return Math.round(v / GRID) * GRID
}

function getSVGCoords(event) {
	const svg = event.currentTarget.closest("svg")
	if (!svg) return { x: 0, y: 0 }
	const rect = svg.getBoundingClientRect()
	const zoom = props.zoomLevel || 1
	return {
		x: snap((event.clientX - rect.left) / zoom),
		y: snap((event.clientY - rect.top) / zoom),
	}
}

function findNearEndpoint(x, y, excludeId = null) {
	for (const wall of walls.value) {
		if (wall.id === excludeId) continue
		if (Math.hypot(wall.x1 - x, wall.y1 - y) < SNAP_DISTANCE) return { x: wall.x1, y: wall.y1 }
		if (Math.hypot(wall.x2 - x, wall.y2 - y) < SNAP_DISTANCE) return { x: wall.x2, y: wall.y2 }
	}
	return null
}

function findWallAt(x, y) {
	for (const wall of walls.value) {
		const dist = pointToSegmentDist(x, y, wall.x1, wall.y1, wall.x2, wall.y2)
		if (dist < 12) return wall
	}
	return null
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
	const dx = x2 - x1
	const dy = y2 - y1
	const lenSq = dx * dx + dy * dy
	if (lenSq === 0) return Math.hypot(px - x1, py - y1)
	let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
	t = Math.max(0, Math.min(1, t))
	return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function positionOnWall(wall, t) {
	return {
		x: wall.x1 + (wall.x2 - wall.x1) * t,
		y: wall.y1 + (wall.y2 - wall.y1) * t,
	}
}

function wallLength(wall) {
	return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1)
}

function wallAngle(wall) {
	return Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1)
}

function generateId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// ── Wall segments (split around doors/windows) ──────────

function getWallSegments(wall) {
	const len = wallLength(wall)
	if (len === 0) return []

	// Collect all gaps on this wall (doors + windows)
	const gaps = []
	for (const door of doors.value) {
		if (door.wallId !== wall.id) continue
		const halfW = (door.width || 50) / 2 / len
		gaps.push({ start: Math.max(0, door.position - halfW), end: Math.min(1, door.position + halfW) })
	}
	for (const win of windows.value) {
		if (win.wallId !== wall.id) continue
		const halfW = (win.width || 60) / 2 / len
		gaps.push({ start: Math.max(0, win.position - halfW), end: Math.min(1, win.position + halfW) })
	}

	if (gaps.length === 0) {
		return [{ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 }]
	}

	// Sort gaps and merge overlaps
	gaps.sort((a, b) => a.start - b.start)
	const merged = [gaps[0]]
	for (let i = 1; i < gaps.length; i++) {
		const last = merged[merged.length - 1]
		if (gaps[i].start <= last.end) {
			last.end = Math.max(last.end, gaps[i].end)
		} else {
			merged.push(gaps[i])
		}
	}

	// Build segments between gaps
	const segments = []
	let t = 0
	for (const gap of merged) {
		if (gap.start > t) {
			const p1 = positionOnWall(wall, t)
			const p2 = positionOnWall(wall, gap.start)
			segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y })
		}
		t = gap.end
	}
	if (t < 1) {
		const p1 = positionOnWall(wall, t)
		segments.push({ x1: p1.x, y1: p1.y, x2: wall.x2, y2: wall.y2 })
	}
	return segments
}

// ── Door geometry ────────────────────────────────────────

function getDoorGeometry(door) {
	const wall = walls.value.find((w) => w.id === door.wallId)
	if (!wall) return null

	const len = wallLength(wall)
	if (len === 0) return null

	const angle = wallAngle(wall)
	const pos = positionOnWall(wall, door.position)
	const radius = (door.width || 50) / 2
	const swing = door.swing === "ccw" ? -1 : 1

	// Door leaf: from hinge point to open position
	const hingeX = pos.x - Math.cos(angle) * radius
	const hingeY = pos.y - Math.sin(angle) * radius
	const openX = hingeX + Math.cos(angle + (swing * Math.PI / 2)) * radius * 2
	const openY = hingeY + Math.sin(angle + (swing * Math.PI / 2)) * radius * 2

	// Arc from closed to open position
	const closedX = pos.x + Math.cos(angle) * radius
	const closedY = pos.y + Math.sin(angle) * radius
	const sweepFlag = swing > 0 ? 1 : 0
	const arc = `M ${closedX},${closedY} A ${radius * 2},${radius * 2} 0 0,${sweepFlag} ${openX},${openY}`

	return {
		arc,
		leaf: { x1: hingeX, y1: hingeY, x2: closedX, y2: closedY },
		center: pos,
	}
}

// ── Window geometry ──────────────────────────────────────

function getWindowGeometry(win) {
	const wall = walls.value.find((w) => w.id === win.wallId)
	if (!wall) return null

	const len = wallLength(wall)
	if (len === 0) return null

	const angle = wallAngle(wall)
	const perpX = -Math.sin(angle)
	const perpY = Math.cos(angle)
	const pos = positionOnWall(wall, win.position)
	const halfW = (win.width || 60) / 2
	const lineLen = 6

	// 3 perpendicular lines across the window gap
	const lines = []
	for (const offset of [-halfW * 0.6, 0, halfW * 0.6]) {
		const cx = pos.x + Math.cos(angle) * offset
		const cy = pos.y + Math.sin(angle) * offset
		lines.push({
			x1: cx + perpX * lineLen,
			y1: cy + perpY * lineLen,
			x2: cx - perpX * lineLen,
			y2: cy - perpY * lineLen,
		})
	}
	return { lines, center: pos }
}

// ── Pointer interactions ─────────────────────────────────

function onCanvasPointerDown(event) {
	if (!props.isEditMode) return
	const { x, y } = getSVGCoords(event)

	if (props.activeTool === "wall") {
		event.preventDefault()
		event.stopPropagation()
		if (!drawStart) {
			// First click: set start point
			const snapped = findNearEndpoint(x, y) || { x, y }
			drawStart = { x: snapped.x, y: snapped.y }
			drawPreview.value = { x1: snapped.x, y1: snapped.y, x2: snapped.x, y2: snapped.y }
		} else {
			// Second click: complete the wall
			const snapped = findNearEndpoint(x, y) || { x, y }
			const len = Math.hypot(snapped.x - drawStart.x, snapped.y - drawStart.y)
			if (len > 15) {
				emit("add-wall", {
					id: generateId(),
					x1: drawStart.x, y1: drawStart.y,
					x2: snapped.x, y2: snapped.y,
				})
			}
			drawStart = null
			drawPreview.value = null
		}
	} else if (props.activeTool === "door") {
		event.preventDefault()
		const wall = findWallAt(x, y)
		if (wall) {
			const t = projectOnWall(wall, x, y)
			emit("add-door", { id: generateId(), wallId: wall.id, position: t, width: 50, swing: "cw" })
		}
	} else if (props.activeTool === "window") {
		event.preventDefault()
		const wall = findWallAt(x, y)
		if (wall) {
			const t = projectOnWall(wall, x, y)
			emit("add-window", { id: generateId(), wallId: wall.id, position: t, width: 60 })
		}
	}
}

function onCanvasPointerMove(event) {
	if (!props.isEditMode) return

	if (props.activeTool === "wall" && drawStart) {
		const { x, y } = getSVGCoords(event)
		const snapped = findNearEndpoint(x, y) || { x, y }
		drawPreview.value = { x1: drawStart.x, y1: drawStart.y, x2: snapped.x, y2: snapped.y }
	} else if (props.activeTool === "door" || props.activeTool === "window") {
		const { x, y } = getSVGCoords(event)
		const wall = findWallAt(x, y)
		placementPreview.value = wall ? positionOnWall(wall, projectOnWall(wall, x, y)) : null
	} else if (dragState) {
		const { x, y } = getSVGCoords(event)
		const snapped = findNearEndpoint(x, y, dragState.wallId) || { x, y }
		if (dragState.endpoint === "start") {
			dragState.wall.x1 = snapped.x
			dragState.wall.y1 = snapped.y
		} else {
			dragState.wall.x2 = snapped.x
			dragState.wall.y2 = snapped.y
		}
		emit("update:walls", [...walls.value])
	}
}

function onCanvasPointerUp() {
	if (dragState) {
		dragState = null
	}
	placementPreview.value = null
}

function projectOnWall(wall, px, py) {
	const dx = wall.x2 - wall.x1
	const dy = wall.y2 - wall.y1
	const lenSq = dx * dx + dy * dy
	if (lenSq === 0) return 0.5
	return Math.max(0.1, Math.min(0.9, ((px - wall.x1) * dx + (py - wall.y1) * dy) / lenSq))
}

function selectElement(id) {
	if (props.activeTool !== "select") return
	selectedId.value = id
	emit("select", id)
}

function startDragEndpoint(event, wall, endpoint) {
	if (props.activeTool !== "select") return
	event.preventDefault()
	dragState = { wall, endpoint, wallId: wall.id }
}

// Public: delete selected element
function deleteSelected() {
	if (!selectedId.value) return
	const id = selectedId.value

	const wallIdx = walls.value.findIndex((w) => w.id === id)
	if (wallIdx >= 0) {
		// Also remove doors/windows attached to this wall
		const newDoors = doors.value.filter((d) => d.wallId !== id)
		const newWindows = windows.value.filter((w) => w.wallId !== id)
		const newWalls = walls.value.filter((w) => w.id !== id)
		emit("update:walls", newWalls)
		emit("update:doors", newDoors)
		emit("update:windows", newWindows)
		selectedId.value = null
		return
	}
	const doorIdx = doors.value.findIndex((d) => d.id === id)
	if (doorIdx >= 0) {
		emit("update:doors", doors.value.filter((d) => d.id !== id))
		selectedId.value = null
		return
	}
	const winIdx = windows.value.findIndex((w) => w.id === id)
	if (winIdx >= 0) {
		emit("update:windows", windows.value.filter((w) => w.id !== id))
		selectedId.value = null
	}
}

function clearSelection() {
	selectedId.value = null
}

defineExpose({ deleteSelected, clearSelection, selectedId })
</script>

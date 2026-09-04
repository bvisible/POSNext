<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The booking form itself: date, -->
	<!-- //// service, covers, tables, guest identity, notes. Used both by the POS dialog and by -->
	<!-- //// the public /pos/reservation page, which is why it has to hold up on a phone as well -->
	<!-- //// as on the till. Upstream POSNext has no reservations. (ebc3ecc5, 2026-03-29 -->
	<!-- //// "restaurant reservation system with POS dialog, online booking, and email -->
	<!-- //// notifications"; 6f17f723 the service selector and area tabs, e4769383 the clay -->
	<!-- //// retheme.) -->
	<div class="reservation-form">
		<h3 class="form-title">
			{{ editing ? __("Edit Reservation") : __("New Reservation") }}
		</h3>

		<!-- Date row -->
		<div class="form-row">
			<div class="form-group">
				<label>{{ __("Date") }} *</label>
				<input v-model="form.reservation_date" type="date" class="form-control" required />
			</div>
		</div>

		<!-- Service period selector -->
		<div v-if="servicesForDate.length > 0" class="form-group">
			<label>{{ __("Service") }}</label>
			<div class="service-tabs">
				<button
					v-for="(svc, idx) in servicesForDate"
					:key="idx"
					class="service-tab"
					:class="{ active: selectedService === svc }"
					@click="selectService(svc)"
				>
					<span class="service-tab-label">{{ svc.label || __("Service") }}</span>
					<span class="service-tab-time">
						{{ svc.from_time?.slice(0, 5) }}&ndash;{{ svc.to_time?.slice(0, 5) }}
					</span>
				</button>
			</div>
		</div>

		<!-- Time & Duration row -->
		<div class="form-row">
			<div class="form-group">
				<label>{{ __("Time") }} *</label>
				<input
					v-model="form.reservation_time"
					type="time"
					class="form-control"
					:min="selectedService ? selectedService.from_time?.slice(0, 5) : undefined"
					:max="selectedService ? selectedService.to_time?.slice(0, 5) : undefined"
					required
				/>
			</div>
			<div class="form-group">
				<label>{{ __("Duration") }}</label>
				<select v-model="form.duration" class="form-control">
					<option value="01:00:00">1h</option>
					<option value="01:30:00">1h30</option>
					<option value="02:00:00">2h</option>
					<option value="02:30:00">2h30</option>
					<option value="03:00:00">3h</option>
				</select>
			</div>
			<div class="form-group">
				<label>{{ __("Guests") }} *</label>
				<input
					v-model.number="form.no_of_guests"
					type="number"
					min="1"
					max="50"
					class="form-control"
					required
				/>
			</div>
		</div>

		<!-- Guest info row -->
		<div class="form-row">
			<div class="form-group flex-2">
				<label>{{ __("Guest Name") }} *</label>
				<input v-model="form.guest_name" type="text" class="form-control" required />
			</div>
			<div class="form-group">
				<label>{{ __("Phone") }}</label>
				<input v-model="form.phone" type="tel" class="form-control" />
			</div>
			<div class="form-group">
				<label>{{ __("Channel") }}</label>
				<select v-model="form.channel" class="form-control">
					<option v-for="ch in channels" :key="ch" :value="ch">{{ ch }}</option>
				</select>
			</div>
		</div>

		<!-- Tables section -->
		<div class="form-group">
			<div class="tables-header">
				<label>{{ __("Tables") }}</label>
				<button
					v-if="hasFloorPlan"
					class="btn-plan-toggle"
					:class="{ active: showFloorPlan }"
					@click="showFloorPlan = !showFloorPlan"
				>
					{{ showFloorPlan ? __("List") : __("Plan") }}
				</button>
			</div>

			<!-- Area filter tabs -->
			<div v-if="tableAreas.length > 1" class="area-tabs">
				<button
					class="area-tab"
					:class="{ active: selectedArea === '' }"
					@click="selectedArea = ''"
				>
					{{ __("All") }}
					<span class="area-count">{{ availableCount }}</span>
				</button>
				<button
					v-for="area in tableAreas"
					:key="area.name"
					class="area-tab"
					:class="{ active: selectedArea === area.name }"
					@click="selectedArea = area.name"
				>
					{{ area.name }}
					<span class="area-count" :class="{ 'area-count-zero': area.available === 0 }">
						{{ area.available }}
					</span>
				</button>
			</div>

			<!-- Floor plan view -->
			<ReservationFloorPlan
				v-if="showFloorPlan"
				:tables="availableTables"
				:selected-tables="selectedTables"
				:selected-area="selectedArea"
				@toggle-table="toggleTable($event)"
			/>

			<!-- Chip list view -->
			<div v-else class="tables-grid">
				<div
					v-for="table in filteredByArea"
					:key="table.name"
					class="table-chip"
					:class="{
						selected: selectedTables.includes(table.name),
						unavailable: !table.available,
					}"
					@click="toggleTable(table)"
				>
					<span class="table-chip-name">{{ table.table_name }}</span>
					<span class="table-chip-area">{{ table.area }}</span>
					<span class="table-chip-capacity">{{ table.capacity }}p</span>
				</div>
			</div>

			<div v-if="totalSeats > 0" class="seats-summary">
				{{ __("Selected: {0} tables, {1} seats", [selectedTables.length, totalSeats]) }}
				<span v-if="totalSeats < form.no_of_guests" class="seats-warning">
					({{ __("fewer seats than guests") }})
				</span>
			</div>
		</div>

		<!-- Email + Notes row -->
		<div class="form-row">
			<div class="form-group">
				<label>{{ __("Email") }}</label>
				<input v-model="form.email" type="email" class="form-control" />
			</div>
			<div class="form-group flex-2">
				<label>{{ __("Notes") }}</label>
				<input v-model="form.notes" type="text" class="form-control" :placeholder="__('Special requests...')" />
			</div>
		</div>

		<!-- Conflict warning -->
		<div v-if="conflicts.length > 0" class="conflict-warning">
			<strong>{{ __("Overlap Warning") }}:</strong>
			<span v-for="(c, idx) in conflicts" :key="idx">
				{{ c.table }} ({{ c.guest_name }} {{ __("at") }} {{ c.time }}){{ idx < conflicts.length - 1 ? ", " : "" }}
			</span>
		</div>

		<!-- Actions -->
		<div class="form-actions">
			<button class="btn-cancel" @click="$emit('cancel')">
				{{ __("Cancel") }}
			</button>
			<button
				v-if="conflicts.length > 0"
				class="btn-force"
				:disabled="saving"
				@click="save(true)"
			>
				{{ __("Force Save") }}
			</button>
			<button
				class="btn-save"
				:disabled="!isValid || saving"
				@click="save(false)"
			>
				{{ saving ? __("Saving...") : __("Save") }}
			</button>
		</div>
	</div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from "vue"
import { useReservations } from "@/composables/useReservations"
import { useToast } from "@/composables/useToast"
import ReservationFloorPlan from "./ReservationFloorPlan.vue"

const props = defineProps({
	reservation: { type: Object, default: null },
	tables: { type: Array, default: () => [] },
	defaultDuration: { type: String, default: "01:30:00" },
	channels: { type: Array, default: () => ["Phone", "Walk-in", "Internet"] },
	openingHours: { type: Array, default: () => [] },
})

const emit = defineEmits(["cancel", "saved"])

const { createReservation, checkAvailability } = useReservations()
const { showSuccess, showError } = useToast()

const editing = computed(() => !!props.reservation?.name)
const saving = ref(false)
const conflicts = ref([])
const availableTables = ref([])
const selectedArea = ref("")
const showFloorPlan = ref(false)
const selectedService = ref(null)

const form = reactive({
	reservation_date:
		props.reservation?.reservation_date ||
		new Date().toISOString().slice(0, 10),
	reservation_time: props.reservation?.reservation_time?.slice(0, 5) || "",
	duration: props.reservation?.duration || props.defaultDuration,
	no_of_guests: props.reservation?.no_of_guests || 2,
	guest_name: props.reservation?.guest_name || "",
	phone: props.reservation?.phone || "",
	email: props.reservation?.email || "",
	channel: props.reservation?.channel || "Phone",
	notes: props.reservation?.notes || "",
})

const selectedTables = ref(
	props.reservation?.tables?.map((t) => t.restaurant_table) || [],
)

// ─── Service period logic ────────────────────────────────

const servicesForDate = computed(() => {
	if (!form.reservation_date || !props.openingHours?.length) return []
	const dayName = new Date(
		`${form.reservation_date}T12:00:00`,
	).toLocaleDateString("en-US", { weekday: "long" })
	// Deduplicate by label+from_time
	const seen = new Set()
	return props.openingHours.filter((h) => {
		if (h.day_of_week !== dayName) return false
		const key = `${h.label}-${h.from_time}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
})

function selectService(svc) {
	selectedService.value = svc
	// If current time is outside the service window, clear it
	if (form.reservation_time) {
		const t = form.reservation_time
		const from = svc.from_time?.slice(0, 5)
		const to = svc.to_time?.slice(0, 5)
		if (t < from || t > to) {
			form.reservation_time = ""
		}
	}
}

// Auto-select service when only one exists
watch(servicesForDate, (svcs) => {
	if (svcs.length === 1) {
		selectedService.value = svcs[0]
	} else {
		selectedService.value = null
	}
})

// ─── Area filter logic ───────────────────────────────────

const tableAreas = computed(() => {
	const areaMap = {}
	for (const t of availableTables.value) {
		if (!t.area) continue
		if (!areaMap[t.area])
			areaMap[t.area] = { name: t.area, available: 0, total: 0 }
		areaMap[t.area].total++
		if (t.available) areaMap[t.area].available++
	}
	return Object.values(areaMap).sort((a, b) => a.name.localeCompare(b.name))
})

const availableCount = computed(() => {
	return availableTables.value.filter((t) => t.available).length
})

const filteredByArea = computed(() => {
	if (!selectedArea.value) return availableTables.value
	return availableTables.value.filter((t) => t.area === selectedArea.value)
})

// ─── Floor plan logic ────────────────────────────────────

const hasFloorPlan = computed(() => {
	return props.tables.some((t) => t.pos_x || t.pos_y)
})

// ─── Table selection & availability ──────────────────────

const totalSeats = computed(() => {
	return availableTables.value
		.filter((t) => selectedTables.value.includes(t.name))
		.reduce((sum, t) => sum + (t.capacity || 0), 0)
})

const isValid = computed(() => {
	return (
		form.reservation_date &&
		form.reservation_time &&
		form.no_of_guests > 0 &&
		form.guest_name?.trim()
	)
})

function toggleTable(table) {
	if (!table.available && !selectedTables.value.includes(table.name)) {
		return
	}
	const idx = selectedTables.value.indexOf(table.name)
	if (idx >= 0) {
		selectedTables.value.splice(idx, 1)
	} else {
		selectedTables.value.push(table.name)
	}
	conflicts.value = []
}

async function loadAvailableTables() {
	if (!form.reservation_date || !form.reservation_time) {
		availableTables.value = props.tables.map((t) => ({ ...t, available: true }))
		return
	}

	try {
		const result = await checkAvailability(
			props.tables.map((t) => t.name),
			form.reservation_date,
			`${form.reservation_time}:00`,
			form.duration,
			props.reservation?.name,
		)
		const conflictMap = {}
		for (const c of result?.conflicts || []) {
			conflictMap[c.table] = true
		}
		availableTables.value = props.tables.map((t) => ({
			...t,
			available: !conflictMap[t.name],
		}))
	} catch {
		availableTables.value = props.tables.map((t) => ({ ...t, available: true }))
	}
}

async function save(force = false) {
	if (!isValid.value) return
	saving.value = true
	conflicts.value = []

	try {
		const data = {
			...form,
			reservation_time: `${form.reservation_time}:00`,
			tables: JSON.stringify(selectedTables.value),
			force,
		}

		const result = await createReservation(data)

		if (result?.status === "conflict") {
			conflicts.value = result.conflicts
			saving.value = false
			return
		}

		showSuccess(__("Reservation created"))
		emit("saved", result)
	} catch (error) {
		showError(__("Failed to create reservation"))
	} finally {
		saving.value = false
	}
}

// Reload availability when date/time/duration changes
watch(
	() => [form.reservation_date, form.reservation_time, form.duration],
	() => {
		if (form.reservation_date && form.reservation_time) {
			loadAvailableTables()
		}
	},
)

// Reset area filter when date changes
watch(
	() => form.reservation_date,
	() => {
		selectedArea.value = ""
	},
)

onMounted(() => {
	loadAvailableTables()
})
</script>

<style scoped>
.reservation-form {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 4px 0;
	overflow-y: auto;
	max-height: 100%;
}

.form-title {
	font-size: 16px;
	font-weight: 600;
	margin: 0;
}

.form-row {
	display: flex;
	gap: 10px;
}

.form-group {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex: 1;
}

.form-group.flex-2 {
	flex: 2;
}

.form-group label {
	font-size: 12px;
	font-weight: 500;
	color: var(--text-muted, #6b7280);
}

.form-control {
	padding: 7px 10px;
	border: 1px solid var(--border-color, #d1d5db);
	border-radius: 6px;
	font-size: 13px;
	background: var(--control-bg, #fff);
	color: var(--text-color, #1f2937);
}

.form-control:focus {
	outline: none;
	border-color: var(--primary, #d68a59);
	box-shadow: 0 0 0 2px rgba(214, 138, 89, 0.15);
}

textarea.form-control {
	resize: vertical;
}

/* Service period selector */
.service-tabs {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
}

.service-tab {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 1px;
	padding: 6px 14px;
	border-radius: 8px;
	border: 1px solid var(--border-color, #d1d5db);
	background: var(--control-bg, #fff);
	cursor: pointer;
	transition: all 0.15s;
}

.service-tab.active {
	background: var(--blue-100, #dbeafe);
	border-color: var(--blue-500, #d68a59);
}

.service-tab-label {
	font-size: 13px;
	font-weight: 600;
	color: var(--heading-color, #111827);
}

.service-tab.active .service-tab-label {
	color: var(--blue-800, #a15a2e);
}

.service-tab-time {
	font-size: 11px;
	color: var(--text-muted, #6b7280);
}

.service-tab.active .service-tab-time {
	color: var(--blue-600, #d68a59);
}

/* Tables header with plan toggle */
.tables-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.btn-plan-toggle {
	padding: 3px 10px;
	border-radius: 6px;
	border: 1px solid var(--border-color, #d1d5db);
	background: var(--control-bg, #fff);
	font-size: 11px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s;
}

.btn-plan-toggle.active {
	background: var(--blue-600, #d68a59);
	border-color: var(--blue-600, #d68a59);
	color: #fff;
}

/* Area filter tabs */
.area-tabs {
	display: flex;
	gap: 4px;
	flex-wrap: wrap;
	margin: 6px 0;
}

.area-tab {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 4px 10px;
	border-radius: 6px;
	border: 1px solid var(--border-color, #d1d5db);
	background: var(--control-bg, #fff);
	cursor: pointer;
	font-size: 12px;
	font-weight: 500;
	transition: all 0.15s;
}

.area-tab.active {
	background: var(--gray-800, #1f2937);
	border-color: var(--gray-800, #1f2937);
	color: #fff;
}

.area-count {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 18px;
	height: 18px;
	padding: 0 4px;
	border-radius: 9px;
	background: var(--green-100, #dcfce7);
	color: var(--green-700, #15803d);
	font-size: 10px;
	font-weight: 700;
}

.area-count-zero {
	background: var(--gray-100, #f3f4f6);
	color: var(--gray-500, #6b7280);
}

.area-tab.active .area-count {
	background: rgba(255, 255, 255, 0.2);
	color: #fff;
}

/* Tables chip grid */
.tables-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.table-chip {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 5px 10px;
	border-radius: 6px;
	border: 1px solid var(--border-color, #d1d5db);
	background: var(--control-bg, #fff);
	cursor: pointer;
	font-size: 12px;
	transition: all 0.15s;
}

.table-chip:hover:not(.unavailable) {
	border-color: var(--primary, #d68a59);
}

.table-chip.selected {
	background: var(--blue-100, #dbeafe);
	border-color: var(--blue-500, #d68a59);
	color: var(--blue-800, #a15a2e);
}

.table-chip.unavailable {
	opacity: 0.4;
	cursor: not-allowed;
	background: var(--gray-100, #f3f4f6);
}

.table-chip-name {
	font-weight: 600;
}

.table-chip-area {
	color: var(--text-muted, #6b7280);
}

.table-chip-capacity {
	color: var(--text-muted, #6b7280);
	font-size: 11px;
}

.seats-summary {
	font-size: 12px;
	color: var(--text-muted, #6b7280);
	margin-top: 4px;
}

.seats-warning {
	color: var(--orange-600, #ea580c);
	font-weight: 500;
}

.conflict-warning {
	padding: 8px 12px;
	background: var(--orange-50, #fff7ed);
	border: 1px solid var(--orange-300, #fdba74);
	border-radius: 6px;
	font-size: 12px;
	color: var(--orange-800, #9a3412);
}

.form-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding-top: 8px;
	border-top: 1px solid var(--border-color, #e5e7eb);
}

.btn-cancel,
.btn-save,
.btn-force {
	padding: 8px 16px;
	border-radius: 6px;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	border: 1px solid transparent;
	transition: all 0.15s;
}

.btn-cancel {
	background: var(--control-bg, #fff);
	border-color: var(--border-color, #d1d5db);
	color: var(--text-color, #374151);
}

.btn-save {
	background: var(--primary, #d68a59);
	color: #fff;
}

.btn-save:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.btn-force {
	background: var(--orange-500, #f97316);
	color: #fff;
}

.btn-cancel:hover {
	background: var(--gray-100, #f3f4f6);
}

.btn-save:hover:not(:disabled) {
	background: var(--primary-dark, #d68a59);
}
</style>

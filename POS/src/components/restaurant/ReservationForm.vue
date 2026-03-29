<template>
	<div class="reservation-form">
		<h3 class="form-title">
			{{ editing ? __("Edit Reservation") : __("New Reservation") }}
		</h3>

		<!-- Date & Time row -->
		<div class="form-row">
			<div class="form-group">
				<label>{{ __("Date") }} *</label>
				<input v-model="form.reservation_date" type="date" class="form-control" required />
			</div>
			<div class="form-group">
				<label>{{ __("Time") }} *</label>
				<input v-model="form.reservation_time" type="time" class="form-control" required />
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
		</div>

		<!-- Guest info row -->
		<div class="form-row">
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
			<div class="form-group flex-2">
				<label>{{ __("Guest Name") }} *</label>
				<input v-model="form.guest_name" type="text" class="form-control" required />
			</div>
		</div>

		<!-- Contact row -->
		<div class="form-row">
			<div class="form-group">
				<label>{{ __("Phone") }}</label>
				<input v-model="form.phone" type="tel" class="form-control" />
			</div>
			<div class="form-group">
				<label>{{ __("Email") }}</label>
				<input v-model="form.email" type="email" class="form-control" />
			</div>
			<div class="form-group">
				<label>{{ __("Channel") }}</label>
				<select v-model="form.channel" class="form-control">
					<option v-for="ch in channels" :key="ch" :value="ch">{{ ch }}</option>
				</select>
			</div>
		</div>

		<!-- Tables selection -->
		<div class="form-group">
			<label>{{ __("Tables") }}</label>
			<div class="tables-grid">
				<div
					v-for="table in availableTables"
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

		<!-- Notes -->
		<div class="form-group">
			<label>{{ __("Notes") }}</label>
			<textarea v-model="form.notes" class="form-control" rows="2" />
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

const props = defineProps({
	reservation: { type: Object, default: null },
	tables: { type: Array, default: () => [] },
	defaultDuration: { type: String, default: "01:30:00" },
	channels: { type: Array, default: () => ["Phone", "Walk-in", "Internet"] },
})

const emit = defineEmits(["cancel", "saved"])

const { createReservation, checkAvailability } = useReservations()
const { showSuccess, showError } = useToast()

const editing = computed(() => !!props.reservation?.name)
const saving = ref(false)
const conflicts = ref([])
const availableTables = ref([])

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
		return // Cannot select unavailable tables
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
		// Merge availability into table list
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

// Reload availability when date/time changes
watch(
	() => [form.reservation_date, form.reservation_time, form.duration],
	() => {
		if (form.reservation_date && form.reservation_time) {
			loadAvailableTables()
		}
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
	border-color: var(--primary, #3b82f6);
	box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

textarea.form-control {
	resize: vertical;
}

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
	border-color: var(--primary, #3b82f6);
}

.table-chip.selected {
	background: var(--blue-100, #dbeafe);
	border-color: var(--blue-500, #3b82f6);
	color: var(--blue-800, #1e40af);
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
	background: var(--primary, #3b82f6);
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
	background: var(--primary-dark, #2563eb);
}
</style>

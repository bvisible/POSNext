<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Day list of reservations with date -->
	<!-- //// and status filters, and the transitions the host drives (confirm, seat, no show). -->
	<!-- //// Upstream POSNext has no reservations. (ebc3ecc5, 2026-03-29 "restaurant reservation -->
	<!-- //// system with POS dialog, online booking, and email notifications"; e4769383 the clay -->
	<!-- //// retheme.) -->
	<div class="reservation-list">
		<!-- Filters -->
		<div class="filters">
			<input
				type="date"
				:value="currentDate"
				class="filter-input"
				@change="$emit('date-change', $event.target.value)"
			/>
			<select
				class="filter-input"
				:value="selectedArea"
				@change="$emit('area-change', $event.target.value)"
			>
				<option value="">{{ __("All Areas") }}</option>
				<option v-for="area in areas" :key="area" :value="area">
					{{ area }}
				</option>
			</select>
			<select
				class="filter-input"
				:value="selectedStatus"
				@change="$emit('status-change', $event.target.value)"
			>
				<option value="">{{ __("All Statuses") }}</option>
				<option value="Pending">{{ __("Pending") }}</option>
				<option value="Confirmed">{{ __("Confirmed") }}</option>
				<option value="Seated">{{ __("Seated") }}</option>
				<option value="Completed">{{ __("Completed") }}</option>
				<option value="Cancelled">{{ __("Cancelled") }}</option>
				<option value="No Show">{{ __("No Show") }}</option>
			</select>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="loading-state">
			{{ __("Loading...") }}
		</div>

		<!-- Empty state -->
		<div v-else-if="filteredReservations.length === 0" class="empty-state">
			{{ __("No reservations for this date") }}
		</div>

		<!-- List -->
		<div v-else class="list-container">
			<div
				v-for="res in filteredReservations"
				:key="res.name"
				class="reservation-row"
				:class="`status-${res.status?.toLowerCase().replace(' ', '-')}`"
				@click="$emit('select', res)"
			>
				<div class="row-time">
					{{ res.reservation_time?.slice(0, 5) }}
				</div>
				<div class="row-info">
					<div class="row-name">{{ res.guest_name }}</div>
					<div class="row-details">
						{{ res.no_of_guests }}{{ __("p") }}
						<span v-if="res.tables?.length">
							· {{ res.tables.map((t) => t.table_name || t.restaurant_table).join(", ") }}
						</span>
					</div>
				</div>
				<div class="row-channel">{{ res.channel }}</div>
				<div class="row-status">
					<span class="status-tag" :class="`tag-${res.status?.toLowerCase().replace(' ', '-')}`">
						{{ __(res.status) }}
					</span>
				</div>
				<div class="row-actions" @click.stop>
					<button
						v-if="res.status === 'Confirmed'"
						class="action-btn seat-btn"
						:title="__('Check-in')"
						@click="$emit('check-in', res)"
					>
						✓
					</button>
					<button
						v-if="res.status === 'Pending'"
						class="action-btn confirm-btn"
						:title="__('Confirm')"
						@click="$emit('confirm', res)"
					>
						✓
					</button>
					<button
						v-if="['Pending', 'Confirmed'].includes(res.status)"
						class="action-btn cancel-btn"
						:title="__('Cancel')"
						@click="$emit('cancel', res)"
					>
						✕
					</button>
					<button
						v-if="res.status === 'Confirmed'"
						class="action-btn noshow-btn"
						:title="__('No Show')"
						@click="$emit('no-show', res)"
					>
						?
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue"

const props = defineProps({
	reservations: { type: Array, default: () => [] },
	loading: { type: Boolean, default: false },
	currentDate: { type: String, default: "" },
	selectedArea: { type: String, default: "" },
	selectedStatus: { type: String, default: "" },
	areas: { type: Array, default: () => [] },
})

defineEmits([
	"date-change",
	"area-change",
	"status-change",
	"select",
	"check-in",
	"confirm",
	"cancel",
	"no-show",
])

const filteredReservations = computed(() => {
	let list = props.reservations
	if (props.selectedArea) {
		list = list.filter((r) =>
			r.tables?.some((t) => t.area === props.selectedArea),
		)
	}
	if (props.selectedStatus) {
		list = list.filter((r) => r.status === props.selectedStatus)
	}
	return list
})
</script>

<style scoped>
.reservation-list {
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden;
}

.filters {
	display: flex;
	gap: 8px;
	padding: 8px 0;
	flex-shrink: 0;
}

.filter-input {
	padding: 6px 10px;
	border: 1px solid var(--border-color, #d1d5db);
	border-radius: 6px;
	font-size: 13px;
	background: var(--control-bg, #fff);
	color: var(--text-color, #1f2937);
	flex: 1;
	min-width: 0;
}

.list-container {
	flex: 1;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.reservation-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border-radius: 8px;
	cursor: pointer;
	background: var(--card-bg, #fff);
	border: 1px solid var(--border-color, #e5e7eb);
	transition: background 0.15s;
}

.reservation-row:hover {
	background: var(--hover-bg, #f9fafb);
}

.row-time {
	font-size: 15px;
	font-weight: 600;
	min-width: 45px;
	color: var(--heading-color, #111827);
}

.row-info {
	flex: 1;
	min-width: 0;
}

.row-name {
	font-weight: 500;
	font-size: 14px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.row-details {
	font-size: 12px;
	color: var(--text-muted, #6b7280);
}

.row-channel {
	font-size: 11px;
	color: var(--text-muted, #6b7280);
}

.status-tag {
	display: inline-block;
	padding: 2px 8px;
	border-radius: 10px;
	font-size: 11px;
	font-weight: 500;
}

.tag-confirmed {
	background: var(--blue-100, #dbeafe);
	color: var(--blue-700, #a15a2e);
}

.tag-pending {
	background: var(--orange-100, #ffedd5);
	color: var(--orange-700, #c2410c);
}

.tag-seated {
	background: var(--green-100, #dcfce7);
	color: var(--green-700, #15803d);
}

.tag-completed {
	background: var(--gray-100, #f3f4f6);
	color: var(--gray-600, #4b5563);
}

.tag-cancelled,
.tag-no-show {
	background: var(--red-100, #fee2e2);
	color: var(--red-700, #b91c1c);
}

.row-actions {
	display: flex;
	gap: 4px;
	flex-shrink: 0;
}

.action-btn {
	width: 28px;
	height: 28px;
	border-radius: 6px;
	border: 1px solid var(--border-color, #d1d5db);
	background: var(--control-bg, #fff);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 13px;
	transition: all 0.15s;
}

.seat-btn:hover,
.confirm-btn:hover {
	background: var(--green-100, #dcfce7);
	border-color: var(--green-300, #86efac);
}

.cancel-btn:hover {
	background: var(--red-100, #fee2e2);
	border-color: var(--red-300, #fca5a5);
}

.noshow-btn:hover {
	background: var(--orange-100, #ffedd5);
	border-color: var(--orange-300, #fdba74);
}

.loading-state,
.empty-state {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 1;
	color: var(--text-muted, #6b7280);
	font-size: 14px;
}
</style>

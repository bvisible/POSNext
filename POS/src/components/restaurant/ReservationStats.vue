<template>
	<div class="reservation-stats">
		<!-- Date range -->
		<div class="stats-filters">
			<div class="filter-group">
				<label>{{ __("From") }}</label>
				<input v-model="fromDate" type="date" class="filter-input" @change="loadStats" />
			</div>
			<div class="filter-group">
				<label>{{ __("To") }}</label>
				<input v-model="toDate" type="date" class="filter-input" @change="loadStats" />
			</div>
		</div>

		<div v-if="loading" class="loading-state">{{ __("Loading...") }}</div>

		<div v-else-if="stats" class="stats-grid">
			<!-- Summary cards -->
			<div class="stat-card">
				<div class="stat-value">{{ stats.total }}</div>
				<div class="stat-label">{{ __("Total Reservations") }}</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{{ stats.total_guests }}</div>
				<div class="stat-label">{{ __("Total Guests") }}</div>
			</div>
			<div class="stat-card">
				<div class="stat-value text-green-600">{{ stats.by_status?.Confirmed || 0 }}</div>
				<div class="stat-label">{{ __("Confirmed") }}</div>
			</div>
			<div class="stat-card">
				<div class="stat-value text-red-600">{{ stats.no_show_rate }}%</div>
				<div class="stat-label">{{ __("No Show Rate") }}</div>
			</div>

			<!-- By status breakdown -->
			<div class="stat-section">
				<h4>{{ __("By Status") }}</h4>
				<div class="stat-bars">
					<div v-for="(count, status) in stats.by_status" :key="status" class="stat-bar-row">
						<span class="bar-label">{{ __(status) }}</span>
						<div class="bar-track">
							<div
								class="bar-fill"
								:style="{ width: `${(count / stats.total) * 100}%` }"
							/>
						</div>
						<span class="bar-value">{{ count }}</span>
					</div>
				</div>
			</div>

			<!-- By channel breakdown -->
			<div class="stat-section">
				<h4>{{ __("By Channel") }}</h4>
				<div class="stat-bars">
					<div v-for="(count, channel) in stats.by_channel" :key="channel" class="stat-bar-row">
						<span class="bar-label">{{ channel }}</span>
						<div class="bar-track">
							<div
								class="bar-fill channel-bar"
								:style="{ width: `${(count / stats.total) * 100}%` }"
							/>
						</div>
						<span class="bar-value">{{ count }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, onMounted } from "vue"
import { useReservations } from "@/composables/useReservations"

const { getStats } = useReservations()

const loading = ref(false)
const stats = ref(null)

// Default: current month
const now = new Date()
const fromDate = ref(
	new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
)
const toDate = ref(now.toISOString().slice(0, 10))

async function loadStats() {
	loading.value = true
	try {
		stats.value = await getStats(fromDate.value, toDate.value)
	} catch {
		stats.value = null
	} finally {
		loading.value = false
	}
}

onMounted(() => loadStats())
</script>

<style scoped>
.reservation-stats {
	display: flex;
	flex-direction: column;
	gap: 16px;
	height: 100%;
	overflow-y: auto;
}

.stats-filters {
	display: flex;
	gap: 12px;
}

.filter-group {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.filter-group label {
	font-size: 12px;
	font-weight: 500;
	color: var(--text-muted, #6b7280);
}

.filter-input {
	padding: 6px 10px;
	border: 1px solid var(--border-color, #d1d5db);
	border-radius: 6px;
	font-size: 13px;
}

.stats-grid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 12px;
}

.stat-card {
	background: var(--card-bg, #fff);
	border: 1px solid var(--border-color, #e5e7eb);
	border-radius: 10px;
	padding: 16px;
	text-align: center;
}

.stat-value {
	font-size: 28px;
	font-weight: 700;
	color: var(--heading-color, #111827);
}

.stat-label {
	font-size: 12px;
	color: var(--text-muted, #6b7280);
	margin-top: 4px;
}

.stat-section {
	grid-column: span 2;
	background: var(--card-bg, #fff);
	border: 1px solid var(--border-color, #e5e7eb);
	border-radius: 10px;
	padding: 16px;
}

.stat-section h4 {
	font-size: 14px;
	font-weight: 600;
	margin: 0 0 12px;
}

.stat-bars {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.stat-bar-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.bar-label {
	font-size: 12px;
	min-width: 80px;
	color: var(--text-color, #374151);
}

.bar-track {
	flex: 1;
	height: 8px;
	background: var(--gray-100, #f3f4f6);
	border-radius: 4px;
	overflow: hidden;
}

.bar-fill {
	height: 100%;
	background: var(--blue-500, #d68a59);
	border-radius: 4px;
	min-width: 2px;
	transition: width 0.3s ease;
}

.bar-fill.channel-bar {
	background: var(--green-500, #22c55e);
}

.bar-value {
	font-size: 12px;
	font-weight: 600;
	min-width: 30px;
	text-align: right;
}

.loading-state {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 1;
	color: var(--text-muted, #6b7280);
}
</style>

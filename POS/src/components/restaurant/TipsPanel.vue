<template>
	<Transition name="fade">
		<div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 z-[300]" @click.self="$emit('close')">
			<div class="fixed inset-0 flex items-center justify-center p-4">
				<div class="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col">
					<!-- Header -->
					<div class="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-pink-50 to-rose-50">
						<div class="flex items-center gap-4">
							<h2 class="text-xl font-bold text-gray-800">{{ __('Tips') }}</h2>
							<!-- Summary badge -->
							<div v-if="!loading && tipsData" class="flex items-center gap-3">
								<span class="text-sm font-semibold text-pink-600 bg-pink-100 px-3 py-1 rounded-full">
									{{ tipsData.count }} {{ __('tips') }}
								</span>
								<span class="text-sm font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full">
									{{ formatPrice(tipsData.total) }}
								</span>
							</div>
						</div>
						<button @click="$emit('close')" class="text-gray-400 hover:text-gray-600">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					<!-- Filters -->
					<div class="px-6 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
						<!-- Date filter -->
						<div class="flex items-center gap-1.5">
							<button v-for="df in dateFilters" :key="df.key"
								@click="activeDateFilter = df.key; loadTips()"
								class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
								:class="activeDateFilter === df.key
									? 'bg-pink-600 text-white'
									: 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'"
							>{{ __(df.label) }}</button>
						</div>

						<!-- Server filter -->
						<select v-model="serverFilter" @change="loadTips()"
							class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-300">
							<option value="">{{ __('All servers') }}</option>
							<option v-for="s in servers" :key="s" :value="s">{{ s }}</option>
						</select>

						<!-- Table filter -->
						<select v-model="tableFilter" @change="loadTips()"
							class="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-300">
							<option value="">{{ __('All tables') }}</option>
							<option v-for="t in tables" :key="t.name" :value="t.name">{{ t.table_name }}</option>
						</select>

						<!-- Refresh -->
						<button @click="loadTips()" class="ml-auto text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-white transition-colors">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
						</button>
					</div>

					<!-- Content -->
					<div class="flex-1 overflow-y-auto p-6">
						<!-- Loading -->
						<div v-if="loading" class="flex justify-center py-12">
							<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
						</div>

						<!-- Empty -->
						<div v-else-if="!tipsData || tipsData.tips.length === 0" class="flex flex-col items-center justify-center py-16 text-gray-400">
							<svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
							</svg>
							<p class="text-sm font-medium">{{ __('No tips found') }}</p>
						</div>

						<!-- Tips list -->
						<div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
							<div v-for="tip in tipsData.tips" :key="tip.name"
								class="border border-gray-200 rounded-xl p-4 hover:border-pink-200 hover:shadow-sm transition-all">
								<div class="flex items-start justify-between mb-2">
									<!-- Amount -->
									<span class="text-xl font-bold text-green-600">{{ formatPrice(tip.amount) }}</span>
									<!-- Status badge -->
									<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
										:class="{
											'bg-green-100 text-green-700': tip.status === 'Collected',
											'bg-blue-100 text-blue-700': tip.status === 'Distributed',
											'bg-gray-100 text-gray-500': tip.status === 'Cancelled',
										}">{{ __(tip.status) }}</span>
								</div>

								<div class="space-y-1.5 text-sm">
									<!-- Server -->
									<div class="flex items-center gap-2 text-gray-600">
										<svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
										</svg>
										<span>{{ tip.server_name || tip.server }}</span>
									</div>

									<!-- Table -->
									<div v-if="tip.table_name" class="flex items-center gap-2 text-gray-600">
										<svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
										</svg>
										<span>{{ tip.table_name }}</span>
									</div>

									<!-- Invoice -->
									<div v-if="tip.sales_invoice" class="flex items-center gap-2 text-gray-600">
										<svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
										</svg>
										<span class="text-blue-600 font-medium">{{ tip.sales_invoice }}</span>
									</div>

									<!-- Payment method -->
									<div class="flex items-center gap-2 text-gray-600">
										<svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
										</svg>
										<span>{{ tip.payment_method }}</span>
									</div>

									<!-- Date -->
									<div class="flex items-center gap-2 text-gray-400 text-xs">
										<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
										</svg>
										<span>{{ formatDate(tip.creation) }}</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup>
import { ref, onMounted, watch } from "vue"
import { call } from "@/utils/apiWrapper"
import { useRestaurantStore } from "@/stores/restaurant"

const props = defineProps({
	show: { type: Boolean, default: false },
})
defineEmits(["close"])

const restaurantStore = useRestaurantStore()
const loading = ref(false)
const tipsData = ref(null)
const activeDateFilter = ref("today")
const serverFilter = ref("")
const tableFilter = ref("")
const servers = ref([])
const tables = ref([])

const dateFilters = [
	{ key: "today", label: "Today" },
	{ key: "week", label: "This week" },
	{ key: "month", label: "This month" },
	{ key: "all", label: "All" },
]

const currency = ref(restaurantStore.restaurantSettings?.currency || "CHF")

function formatPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency.value,
		minimumFractionDigits: 2,
	}).format(amount || 0)
}

function formatDate(dateStr) {
	if (!dateStr) return ""
	try {
		const d = new Date(dateStr)
		return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
	} catch { return dateStr }
}

function getDateRange() {
	const today = new Date()
	const yyyy = today.getFullYear()
	const mm = String(today.getMonth() + 1).padStart(2, "0")
	const dd = String(today.getDate()).padStart(2, "0")
	const todayStr = `${yyyy}-${mm}-${dd}`

	if (activeDateFilter.value === "today") {
		return { from_date: todayStr, to_date: todayStr }
	}
	if (activeDateFilter.value === "week") {
		const weekAgo = new Date(today)
		weekAgo.setDate(today.getDate() - 7)
		const wy = weekAgo.getFullYear()
		const wm = String(weekAgo.getMonth() + 1).padStart(2, "0")
		const wd = String(weekAgo.getDate()).padStart(2, "0")
		return { from_date: `${wy}-${wm}-${wd}`, to_date: todayStr }
	}
	if (activeDateFilter.value === "month") {
		return { from_date: `${yyyy}-${mm}-01`, to_date: todayStr }
	}
	return {} // all
}

async function loadTips() {
	loading.value = true
	try {
		const range = getDateRange()
		const args = { ...range }
		if (serverFilter.value) args.server = serverFilter.value
		if (tableFilter.value) args.table = tableFilter.value

		const result = await call("pos_next.api.restaurant.get_tips", args)
		tipsData.value = result

		// Extract unique servers for filter dropdown
		if (result?.tips) {
			const serverSet = new Set()
			for (const t of result.tips) {
				if (t.server_name) serverSet.add(t.server_name)
				else if (t.server) serverSet.add(t.server)
			}
			servers.value = [...serverSet].sort()
		}
	} catch (e) {
		console.error("[TipsPanel] Failed to load tips:", e)
	} finally {
		loading.value = false
	}
}

async function loadTables() {
	try {
		const result = await call("pos_next.api.restaurant.get_tables")
		tables.value = result?.tables || []
	} catch { /* ignore */ }
}

watch(() => props.show, (val) => {
	if (val) {
		loadTips()
		loadTables()
	}
})

onMounted(() => {
	if (props.show) {
		loadTips()
		loadTables()
	}
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

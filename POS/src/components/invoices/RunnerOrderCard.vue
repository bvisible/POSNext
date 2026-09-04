<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The runner screen: what the kitchen -->
	<!-- //// has finished and somebody must now carry to a table. Upstream POSNext has no -->
	<!-- //// preparation workflow at all. One card per ready batch, grouped either by table or by -->
	<!-- //// preparation station (the station colour tints the header), with the time since it was -->
	<!-- //// marked Ready turning orange past 5 minutes and red past 10, so nothing sits under the -->
	<!-- //// pass. Modifiers arrive as JSON groups and are flattened to readable names before -->
	<!-- //// display (d59036f1, 2026-03-23 "preparation workflows, runner display, and workflow -->
	<!-- //// APIs"; fbba3b7a, 2026-03-23, for the modifier names). -->
	<div class="bg-white dark:bg-gray-800 rounded-xl shadow-md border-2 border-green-400 overflow-hidden flex flex-col">
		<!-- Card Header -->
		<div class="px-4 py-3 border-b flex justify-between items-center"
			:class="viewMode === 'station'
				? ''
				: 'bg-green-50 dark:bg-green-900/30'"
			:style="viewMode === 'station' ? { backgroundColor: (card.stationColor || '#22C55E') + '15' } : {}">
			<div>
				<h3 class="font-bold text-xl leading-tight">{{ card.title }}</h3>
				<span class="text-xs text-gray-500 font-medium">{{ card.subtitle }}</span>
			</div>
			<div class="text-right">
				<div class="font-mono text-lg font-bold" :class="waitTimeClass">{{ elapsedTime }}</div>
				<span class="text-[10px] uppercase font-bold bg-green-200 text-green-800 dark:bg-green-900/50 dark:text-green-300 px-2 py-0.5 rounded-full">
					{{ __("Ready") }}
				</span>
			</div>
		</div>

		<!-- Items list -->
		<div class="flex-1 p-4">
			<!-- Table mode: flat list with station badges -->
			<template v-if="viewMode === 'table'">
				<ul class="divide-y divide-gray-100 dark:divide-gray-700">
					<li v-for="item in card.items" :key="item.name" class="py-2 flex items-center gap-3">
						<!-- Station badge -->
						<span v-if="item.preparation_station"
							class="text-[9px] font-bold uppercase px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0"
							:style="{
								backgroundColor: (item.station_color || '#6B7280') + '20',
								color: item.station_color || '#6B7280',
								border: '1px solid ' + (item.station_color || '#6B7280') + '40'
							}">
							{{ item.preparation_station }}
						</span>

						<!-- Item info -->
						<div class="flex-1 min-w-0">
							<span class="font-medium text-gray-900 dark:text-gray-100">{{ item.item_name }}</span>
							<div v-if="item.posa_special_instructions" class="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
								{{ item.posa_special_instructions }}
							</div>
							<!-- Modifiers -->
							<div v-if="parsedModifiers(item)" class="mt-0.5 flex flex-wrap gap-1">
								<span v-for="mod in parsedModifiers(item)" :key="mod"
									class="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
									{{ mod }}
								</span>
							</div>
						</div>

						<!-- Quantity -->
						<div class="font-bold text-lg w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0">
							{{ item.qty }}
						</div>
					</li>
				</ul>
			</template>

			<!-- Station mode: items grouped by table -->
			<template v-else>
				<div v-for="group in card.tableGroups" :key="group.tableName" class="mb-3 last:mb-0">
					<div class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 flex justify-between items-center">
						<span>{{ group.tableName }}</span>
						<button
							@click="deliverTableGroup(group)"
							class="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors"
							:disabled="loading"
						>
							{{ __("Deliver") }}
						</button>
					</div>
					<ul class="divide-y divide-gray-100 dark:divide-gray-700">
						<li v-for="item in group.items" :key="item.name" class="py-1.5 flex items-center gap-3">
							<div class="flex-1 min-w-0">
								<span class="font-medium text-gray-900 dark:text-gray-100 text-sm">{{ item.item_name }}</span>
								<div v-if="item.posa_special_instructions" class="text-xs text-blue-600 dark:text-blue-400">
									{{ item.posa_special_instructions }}
								</div>
							</div>
							<div class="font-bold w-7 h-7 text-sm flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0">
								{{ item.qty }}
							</div>
						</li>
					</ul>
				</div>
			</template>
		</div>

		<!-- Action: Mark Delivered -->
		<div class="p-3 border-t bg-gray-50 dark:bg-gray-800/80">
			<Button
				variant="solid"
				class="w-full h-14 text-lg font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md"
				@click="markDelivered"
				:loading="loading"
			>
				<template #prefix>
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
					</svg>
				</template>
				{{ __("Mark Delivered") }}
			</Button>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue"
import { Button } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"

const props = defineProps({
	card: {
		type: Object,
		required: true,
	},
	viewMode: {
		type: String,
		default: "table",
	},
})

const emit = defineEmits(["delivered"])
const { showError } = useToast()
const loading = ref(false)

const now = ref(new Date())
let timerInterval = null

onMounted(() => {
	timerInterval = setInterval(() => {
		now.value = new Date()
	}, 1000)
})

onUnmounted(() => {
	if (timerInterval) clearInterval(timerInterval)
})

const cardTime = computed(
	() => new Date(props.card.modified || props.card.creation),
)
const elapsedMinutes = computed(() =>
	Math.floor((now.value - cardTime.value) / 60000),
)

const elapsedTime = computed(() => {
	const min = elapsedMinutes.value.toString().padStart(2, "0")
	const sec = Math.floor(((now.value - cardTime.value) % 60000) / 1000)
		.toString()
		.padStart(2, "0")
	return `${min}:${sec}`
})

const waitTimeClass = computed(() => {
	if (elapsedMinutes.value > 10) return "text-red-600 animate-pulse"
	if (elapsedMinutes.value > 5) return "text-orange-500"
	return "text-green-600"
})

function parsedModifiers(item) {
	if (!item.posa_item_modifiers) return null
	try {
		const mods = JSON.parse(item.posa_item_modifiers)
		if (!Array.isArray(mods) || !mods.length) return null
		// Flatten modifier groups into readable names
		const names = mods.flatMap((m) =>
			(m.options || []).map((o) => o.name || o.option_name || String(o)),
		)
		return names.length ? names : null
	} catch {
		return null
	}
}

async function markDelivered() {
	loading.value = true
	try {
		if (props.viewMode === "table") {
			// Table mode: mark all items in this order as delivered
			const itemNames = props.card.items.map((i) => i.name)
			await call("pos_next.api.restaurant.mark_items_delivered", {
				invoice_name: props.card.invoiceName,
				item_names: JSON.stringify(itemNames),
			})
		} else {
			// Station mode: mark all items across all table groups
			const byInvoice = {}
			for (const group of props.card.tableGroups) {
				for (const item of group.items) {
					const inv = item._invoiceName
					if (!byInvoice[inv]) byInvoice[inv] = []
					byInvoice[inv].push(item.name)
				}
			}
			const promises = Object.entries(byInvoice).map(([inv, names]) =>
				call("pos_next.api.restaurant.mark_items_delivered", {
					invoice_name: inv,
					item_names: JSON.stringify(names),
				}),
			)
			await Promise.all(promises)
		}
		emit("delivered")
	} catch (error) {
		console.error("Failed to mark delivered:", error)
		showError(__("Failed to mark items as delivered."))
	} finally {
		loading.value = false
	}
}

async function deliverTableGroup(group) {
	loading.value = true
	try {
		const itemNames = group.items.map((i) => i.name)
		await call("pos_next.api.restaurant.mark_items_delivered", {
			invoice_name: group.invoiceName,
			item_names: JSON.stringify(itemNames),
		})
		emit("delivered")
	} catch (error) {
		console.error("Failed to deliver table group:", error)
		showError(__("Failed to mark items as delivered."))
	} finally {
		loading.value = false
	}
}
</script>

<!-- //// Neoffice — added file (no upstream equivalent). The « Still open » block of the shift closing (NeoResto lot 1, the -->
<!-- //// product owner, 08.11.2026, solution C of the study of the open tables): at the closing, all tables should be closed -->
<!-- //// and nobody should be left at one. The closing reads submitted invoices only, so an order still open on a table is in -->
<!-- //// none of its figures, and a ticket held on this device is erased by signing out. This block lists both, quietly, and -->
<!-- //// blocks nothing: the manager sees what is left before closing. Settling an order (loss, offered, tab, cancelled) is the -->
<!-- //// next step of the study. -->
<script setup>
import { computed, ref, watch } from "vue"
import { useFormatters } from "../../composables/useFormatters"
import { usePOSShiftStore } from "../../stores/posShift"
import { useRestaurantStore } from "../../stores/restaurant"
import { call } from "../../utils/apiWrapper"
import { getAllDrafts } from "../../utils/draftManager"
import { logger } from "../../utils/logger"
import {
	BADGE_TONES,
	badgesOfOrder,
	cashHint,
	heldTicketsNotice,
	heldTicketsOf,
	openOrdersLine,
	quietFor,
	summaryOfOpenOrders,
} from "../../utils/stillOpenAtClosing"

const log = logger.create("ClosingStillOpen")

const props = defineProps({
	// The closing dialog is open: the block reads again each time it opens (a dialog may keep its content mounted)
	active: { type: Boolean, default: true },
	// The cash counted is over what was expected: only given to someone who sees the difference
	cashIsOver: { type: Boolean, default: false },
})

const restaurantStore = useRestaurantStore()
const shiftStore = usePOSShiftStore()
const { formatCurrency } = useFormatters()

const orders = ref([])
const held = ref([])
const failed = ref(false)

async function load() {
	failed.value = false
	try {
		held.value = heldTicketsOf(await getAllDrafts(), shiftStore.profileName)
	} catch (error) {
		log.warn("Could not read the held tickets of this device", error)
		held.value = []
	}
	if (!restaurantStore.isEnabled) {
		orders.value = []
		return
	}
	try {
		const answer = await call("pos_next.api.restaurant.get_open_orders", {
			pos_profile: shiftStore.profileName,
			...restaurantStore.ofTheRestaurant(),
		})
		orders.value = answer?.orders || []
	} catch (error) {
		log.warn("Could not read the open orders", error)
		orders.value = []
		failed.value = true
	}
}

watch(
	() => props.active,
	(isActive) => {
		if (isActive) load()
	},
	{ immediate: true },
)

const summary = computed(() => summaryOfOpenOrders(orders.value))
const heldNotice = computed(() => heldTicketsNotice(held.value.length))
const hint = computed(() => cashHint(summary.value, props.cashIsOver))
const visible = computed(() => orders.value.length > 0 || held.value.length > 0 || failed.value)
</script>

<template>
	<div
		v-if="visible"
		class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 md:px-5 md:py-3"
		data-test="closing-still-open"
	>
		<h3 class="text-sm md:text-base font-semibold text-amber-900">
			{{ __("Still open") }}
		</h3>

		<p v-if="summary.count" class="text-xs md:text-sm text-amber-800 mt-0.5" data-test="still-open-line">
			{{ openOrdersLine(summary.count) }}
			<span class="font-semibold">{{ formatCurrency(summary.total) }}</span>
		</p>

		<ul v-if="summary.count" class="mt-2 max-h-48 overflow-y-auto space-y-1.5" data-test="still-open-orders">
			<li
				v-for="order in orders"
				:key="order.name"
				class="flex items-center justify-between gap-3 text-sm"
				data-test="still-open-order"
			>
				<span class="min-w-0">
					<span class="font-semibold text-gray-900">{{ order.label }}</span>
					<span class="text-xs text-gray-600"> · {{ quietFor(order.idle_minutes) }}</span>
					<span class="ms-1.5 inline-flex flex-wrap gap-1 align-middle">
						<span
							v-for="badge in badgesOfOrder(order)"
							:key="badge.key"
							class="rounded-full px-2 py-0.5 text-xs font-semibold"
							:class="BADGE_TONES[badge.tone]"
							:data-badge="badge.key"
						>
							{{ badge.text }}
						</span>
					</span>
				</span>
				<span class="flex-shrink-0 font-semibold text-gray-900">
					{{ formatCurrency(order.grand_total) }}
				</span>
			</li>
		</ul>

		<p v-if="hint" class="text-xs md:text-sm text-amber-900 mt-2" data-test="still-open-cash-hint">
			{{ hint }}
		</p>

		<p v-if="held.length" class="text-xs md:text-sm text-amber-900 mt-2" data-test="still-open-held">
			{{ heldNotice }}
		</p>

		<div v-if="failed" class="mt-2 flex items-center gap-2 text-xs md:text-sm text-amber-900" data-test="still-open-failed">
			<span>{{ __("The open orders could not be read.") }}</span>
			<button type="button" class="font-semibold underline" @click="load">
				{{ __("Try again") }}
			</button>
		</div>
	</div>
</template>

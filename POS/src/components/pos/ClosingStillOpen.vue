<!-- //// Neoffice — added file (no upstream equivalent). The « Still open » block of the shift closing (NeoResto lot 1, the -->
<!-- //// product owner, 08.11.2026, solution C of the study of the open tables): at the closing, all tables should be closed -->
<!-- //// and nobody should be left at one; and a draft is something to do something with. The closing reads submitted invoices -->
<!-- //// only, so an order still open on a table is in none of its figures, a draft the till left on the server is invisible, and -->
<!-- //// a ticket held on this device is easy to forget. This block lists them all, and the user settles an order (cashed, tab, -->
<!-- //// offered, loss, cancelled), keeps or deletes a held ticket, deletes a loose draft: by his own hand, never in silence. -->
<!-- //// It blocks nothing. -->
<script setup>
import { computed, ref, watch } from "vue"
import { useFormatters } from "../../composables/useFormatters"
import { useToast } from "../../composables/useToast"
import { usePOSShiftStore } from "../../stores/posShift"
import { useRestaurantStore } from "../../stores/restaurant"
import { call } from "../../utils/apiWrapper"
import { currentUser } from "../../utils/draftOwner"
import { getAllDrafts } from "../../utils/draftManager"
import { logger } from "../../utils/logger"
import { canBeSettled } from "../../utils/settleOrder"
import {
	BADGE_TONES,
	badgesOfOrder,
	cashHint,
	heldTicketsNotice,
	heldTicketsOf,
	linesText,
	looseDraftsLine,
	openOrdersLine,
	quietFor,
	summaryOfOpenOrders,
} from "../../utils/stillOpenAtClosing"
import HeldTicketsList from "./HeldTicketsList.vue"
import SettleOrderDialog from "./SettleOrderDialog.vue"

const log = logger.create("ClosingStillOpen")

const props = defineProps({
	// The closing dialog is open: the block reads again each time it opens (a dialog may keep its content mounted)
	active: { type: Boolean, default: true },
	// The cash counted is over what was expected: only given to someone who sees the difference
	cashIsOver: { type: Boolean, default: false },
})

const emit = defineEmits(["settled"])

const restaurantStore = useRestaurantStore()
const shiftStore = usePOSShiftStore()
const { formatCurrency } = useFormatters()
const { showError } = useToast()

const orders = ref([])
// The order being settled (its dialog is open), and the orders' own: whoever opened an order may leave it open for a colleague, or settle it now
const settling = ref(null)
const showSettle = ref(false)
// The tickets held on this device, and whether their list is open
const held = ref([])
const showHeld = ref(false)
// The drafts the till left on the server, and the one whose deletion waits for a second tap
const loose = ref([])
const confirmingLoose = ref("")
const failed = ref(false)

async function load() {
	failed.value = false
	try {
		held.value = heldTicketsOf(await getAllDrafts(), shiftStore.profileName, currentUser())
	} catch (error) {
		log.warn("Could not read the held tickets of this device", error)
		held.value = []
	}
	try {
		const answer = await call("pos_next.api.invoices.get_loose_drafts", { pos_profile: shiftStore.profileName })
		loose.value = answer?.drafts || []
	} catch (error) {
		log.warn("Could not read the drafts of the till", error)
		loose.value = []
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

function startSettling(order) {
	settling.value = order
	showSettle.value = true
}

// Once an order is settled: the list is read again, and the closing, whose figures the new sale changes
async function afterSettling(done) {
	await load()
	emit("settled", done)
}

// A loose draft is deleted by a second tap on the same button: the first one asks
async function deleteLoose(draft) {
	if (confirmingLoose.value !== draft.name) {
		confirmingLoose.value = draft.name
		return
	}
	confirmingLoose.value = ""
	try {
		await call("pos_next.api.invoices.delete_loose_draft", { invoice: draft.name, pos_profile: shiftStore.profileName })
		await load()
	} catch (error) {
		log.warn("Could not delete the draft", error)
		showError(__("Failed to delete draft"))
	}
}

const mineStayOpen = computed(() => orders.value.some((order) => order.mine))
const summary = computed(() => summaryOfOpenOrders(orders.value))
const heldNotice = computed(() => heldTicketsNotice(held.value.length))
const looseLine = computed(() => looseDraftsLine(loose.value.length))
const hint = computed(() => cashHint(summary.value, props.cashIsOver))
const tableLabel = (table) => restaurantStore.tableLabel?.(table) || table
const visible = computed(
	() => orders.value.length > 0 || held.value.length > 0 || loose.value.length > 0 || failed.value,
)
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
			<span class="font-semibold">· {{ formatCurrency(summary.total) }}</span>
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
					<span v-if="!order.mine && order.owner" class="text-xs text-gray-600"> · {{ order.owner }}</span>
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
				<span class="flex flex-shrink-0 items-center gap-2">
					<span class="font-semibold text-gray-900">{{ formatCurrency(order.grand_total) }}</span>
					<button
						v-if="canBeSettled(order)"
						type="button"
						class="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
						data-test="settle-order"
						@click="startSettling(order)"
					>
						{{ __("Settle") }}
					</button>
					<span v-else-if="order.holds_money" class="text-xs text-amber-900" data-test="open-at-its-table">
						{{ __("Cash it from its table") }}
					</span>
				</span>
			</li>
		</ul>

		<p v-if="mineStayOpen" class="text-xs md:text-sm text-amber-900 mt-2" data-test="still-open-mine">
			{{ __("The orders you opened can stay open for a colleague, who cashes them in his own shift, or be settled now.") }}
		</p>

		<p v-if="hint" class="text-xs md:text-sm text-amber-900 mt-2" data-test="still-open-cash-hint">
			{{ hint }}
		</p>

		<div v-if="loose.length" class="mt-2" data-test="still-open-loose">
			<p class="text-xs md:text-sm text-amber-900">{{ looseLine }}</p>
			<ul class="mt-1 max-h-32 overflow-y-auto space-y-1">
				<li
					v-for="draft in loose"
					:key="draft.name"
					class="flex items-center justify-between gap-3 text-sm"
					data-test="loose-draft"
				>
					<span class="min-w-0 truncate">
						<span class="font-semibold text-gray-900">{{ draft.customer_name || draft.customer || __("Draft") }}</span>
						<span class="text-xs text-gray-600"> · {{ linesText(draft.lines) }}</span>
					</span>
					<span class="flex flex-shrink-0 items-center gap-2">
						<span class="font-semibold text-gray-900">{{ formatCurrency(draft.grand_total) }}</span>
						<button
							type="button"
							class="rounded-md border px-2 py-0.5 text-xs font-semibold"
							:class="
								confirmingLoose === draft.name
									? 'border-red-600 bg-red-600 text-white'
									: 'border-gray-300 bg-white text-gray-800'
							"
							data-test="loose-draft-delete"
							@click="deleteLoose(draft)"
						>
							{{ confirmingLoose === draft.name ? __("Confirm: delete") : __("Delete") }}
						</button>
					</span>
				</li>
			</ul>
		</div>

		<div v-if="held.length" class="mt-2" data-test="still-open-held">
			<p class="text-xs md:text-sm text-amber-900">
				{{ heldNotice }}
				<button
					type="button"
					class="ms-1 font-semibold underline"
					data-test="held-tickets-toggle"
					@click="showHeld = !showHeld"
				>
					{{ showHeld ? __("Hide them") : __("See them") }}
				</button>
			</p>
			<HeldTicketsList
				v-if="showHeld"
				:tickets="held"
				:format-money="formatCurrency"
				:table-label="tableLabel"
				@changed="load"
			/>
		</div>

		<div v-if="failed" class="mt-2 flex items-center gap-2 text-xs md:text-sm text-amber-900" data-test="still-open-failed">
			<span>{{ __("The open orders could not be read.") }}</span>
			<button type="button" class="font-semibold underline" @click="load">
				{{ __("Try again") }}
			</button>
		</div>

		<SettleOrderDialog v-model="showSettle" :order="settling" :format-money="formatCurrency" @settled="afterSettling" />
	</div>
</template>

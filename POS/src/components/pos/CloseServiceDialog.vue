<!-- //// Neoffice — added file (no upstream equivalent). Closing the service of the restaurant (NeoResto lot 1, the product owner, 08.11.2026: « théoriquement, quand on clôture le -->
<!-- //// restaurant, toutes les tables sont fermées »; « si des gens traînent encore au bistrot, le restaurant n'est pas fermé »; solution C of the study of the open tables). A shift is one -->
<!-- //// person's till, the service is the restaurant's. One question, « is the room empty? » (no: nothing happens, the service stays open); then each order that is not an empty table is settled -->
<!-- //// (the dialog of the shift's closing), the ones that never left for the kitchen together, and the service closes when none is left. The server does the rest and writes the closing down. -->
<script setup>
import { Button, Dialog } from "frappe-ui"
import { computed, ref, watch } from "vue"
import { useFormatters } from "../../composables/useFormatters"
import { useToast } from "../../composables/useToast"
import { usePOSShiftStore } from "../../stores/posShift"
import { useRestaurantStore } from "../../stores/restaurant"
import { call } from "../../utils/apiWrapper"
import {
	byItselfLines,
	canClose,
	closedLines,
	leftLine,
	leftToSettle,
	neverSentLine,
	neverSentReason,
	stagesOf,
} from "../../utils/closeService"
import { logger } from "../../utils/logger"
import { canBeSettled } from "../../utils/settleOrder"
import { BADGE_TONES, badgesOfOrder, quietFor } from "../../utils/stillOpenAtClosing"
import SettleOrderDialog from "./SettleOrderDialog.vue"

const log = logger.create("CloseServiceDialog")

const props = defineProps({
	modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(["update:modelValue", "closed"])

const restaurantStore = useRestaurantStore()
const shiftStore = usePOSShiftStore()
const { formatCurrency } = useFormatters()
const { showError, showInfo } = useToast()

const open = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
})

// « ask »: the question; « settle »: the orders to settle; « done »: what the closing did
const step = ref("ask")
const survey = ref(null)
const loading = ref(false)
const working = ref(false)
const failed = ref("")
const answer = ref(null)
const settling = ref(null)
const showSettle = ref(false)

const orders = computed(() => survey.value?.orders || [])
const stages = computed(() => stagesOf(orders.value))
const toSettle = computed(() => leftToSettle(orders.value))
const readyToClose = computed(() => !loading.value && canClose(orders.value))
const byItself = computed(() => byItselfLines(survey.value))
const closed = computed(() => closedLines(answer.value))

async function read() {
	loading.value = true
	failed.value = ""
	try {
		survey.value = await call("pos_next.api.restaurant.get_service_closing", {
			pos_profile: shiftStore.profileName,
			...restaurantStore.ofTheRestaurant(),
		})
	} catch (error) {
		log.warn("Could not read what the closing of the service meets", error)
		survey.value = null
		failed.value = error?.messages?.[0] || error?.message || __("The open orders could not be read.")
	} finally {
		loading.value = false
	}
}

// A fresh dialog each time: it opens on the question
watch(
	() => props.modelValue,
	(isOpen) => {
		if (!isOpen) return
		step.value = "ask"
		survey.value = null
		answer.value = null
		failed.value = ""
		read()
	},
	{ immediate: true },
)

// « No »: guests are still there, so the service is not closed — nothing is changed
function stillOpen() {
	open.value = false
	showInfo(__("The service stays open."))
}

function roomIsEmpty() {
	step.value = "settle"
}

function startSettling(order) {
	settling.value = order
	showSettle.value = true
}

async function afterSettling() {
	await read()
}

// The orders that never left for the kitchen consumed nothing: one gesture cancels them together, each with its row in the journal
async function cancelNeverSent() {
	working.value = true
	try {
		for (const order of stages.value.neverSent) {
			await call("pos_next.api.restaurant.settle_open_order", {
				invoice: order.name,
				issue: "cancelled",
				reason: neverSentReason(),
			})
		}
	} catch (error) {
		log.warn("Could not cancel the orders that never left", error)
		showError(error?.messages?.[0] || error?.message || __("The order could not be settled"))
	} finally {
		working.value = false
		await read()
	}
}

async function closeTheService() {
	if (!readyToClose.value || working.value) return
	working.value = true
	try {
		answer.value = await call("pos_next.api.restaurant.close_service", {
			pos_profile: shiftStore.profileName,
			...restaurantStore.ofTheRestaurant(),
			room_empty: 1,
		})
		step.value = "done"
		emit("closed", answer.value)
		// The floor of this till shows the tables free at once (the other tills are told by the server)
		restaurantStore.fetchFromNetwork?.()
	} catch (error) {
		log.warn("Could not close the service", error)
		showError(error?.messages?.[0] || error?.message || __("The service could not be closed"))
		await read()
	} finally {
		working.value = false
	}
}
</script>

<template>
	<Dialog v-model="open" :options="{ title: __('Close the service'), size: 'lg' }">
		<template #body-content>
			<div class="flex flex-col gap-3" data-test="close-service-dialog">
				<!-- The question -->
				<div v-if="step === 'ask'" class="flex flex-col gap-3" data-test="close-service-ask">
					<p class="text-base font-semibold text-gray-900">
						{{ __("Is the room empty?") }}
					</p>
					<p class="text-sm text-gray-600">
						{{ __("If guests are still there, the restaurant is not closed.") }}
					</p>
					<p v-if="failed" class="text-sm text-red-700" data-test="close-service-failed">
						{{ failed }}
					</p>
					<div class="mt-1 flex justify-end gap-2">
						<Button variant="subtle" data-test="room-not-empty" @click="stillOpen">
							{{ __("No, guests are still here") }}
						</Button>
						<Button variant="solid" :disabled="loading || !!failed" data-test="room-empty" @click="roomIsEmpty">
							{{ __("Yes, the room is empty") }}
						</Button>
					</div>
				</div>

				<!-- The orders to settle, then the closing -->
				<div v-else-if="step === 'settle'" class="flex flex-col gap-3" data-test="close-service-settle">
					<p v-if="toSettle.length" class="text-sm font-semibold text-amber-900" data-test="close-service-left">
						{{ leftLine(toSettle.length) }}
					</p>
					<p v-else class="text-sm font-semibold text-green-800" data-test="close-service-ready">
						{{ __("Every order is settled: the service can close.") }}
					</p>

					<div
						v-if="stages.neverSent.length"
						class="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
						data-test="never-sent"
					>
						<span class="text-sm text-amber-900">{{ neverSentLine(stages.neverSent.length) }}</span>
						<Button variant="subtle" :loading="working" data-test="cancel-never-sent" @click="cancelNeverSent">
							{{ __("Cancel them") }}
						</Button>
					</div>

					<ul v-if="toSettle.length" class="max-h-64 space-y-1.5 overflow-y-auto" data-test="close-service-orders">
						<li
							v-for="order in toSettle"
							:key="order.name"
							class="flex items-center justify-between gap-3 text-sm"
							data-test="close-service-order"
						>
							<span class="min-w-0">
								<span class="font-semibold text-gray-900">{{ order.label }}</span>
								<span class="text-xs text-gray-600"> · {{ quietFor(order.idle_minutes) }}</span>
								<span v-if="order.owner" class="text-xs text-gray-600"> · {{ order.owner }}</span>
								<span class="ms-1.5 inline-flex flex-wrap gap-1 align-middle">
									<span
										v-for="badge in badgesOfOrder(order)"
										:key="badge.key"
										class="rounded-full px-2 py-0.5 text-xs font-semibold"
										:class="BADGE_TONES[badge.tone]"
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

					<ul v-if="byItself.length" class="space-y-0.5 text-xs text-gray-600" data-test="close-service-by-itself">
						<li v-for="line in byItself" :key="line">· {{ line }}</li>
					</ul>

					<p v-if="failed" class="text-sm text-red-700" data-test="close-service-failed">
						{{ failed }}
					</p>

					<div class="mt-1 flex justify-end gap-2">
						<Button variant="subtle" @click="open = false">{{ __("Cancel") }}</Button>
						<Button
							variant="solid"
							:disabled="!readyToClose"
							:loading="working"
							data-test="close-the-service"
							@click="closeTheService"
						>
							{{ __("Close the service") }}
						</Button>
					</div>
				</div>

				<!-- What the closing did -->
				<div v-else class="flex flex-col gap-3" data-test="close-service-done">
					<p class="text-base font-semibold text-gray-900">
						{{ __("The service is closed.") }}
					</p>
					<ul v-if="closed.length" class="space-y-0.5 text-sm text-gray-700">
						<li v-for="line in closed" :key="line">· {{ line }}</li>
					</ul>
					<div class="mt-1 flex justify-end">
						<Button variant="solid" data-test="close-service-finish" @click="open = false">{{ __("Done") }}</Button>
					</div>
				</div>
			</div>
		</template>
	</Dialog>
	<SettleOrderDialog v-model="showSettle" :order="settling" :format-money="formatCurrency" @settled="afterSettling" />
</template>

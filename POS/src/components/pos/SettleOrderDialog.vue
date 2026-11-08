<!-- //// Neoffice — added file (no upstream equivalent). Settling one open order when the service closes (NeoResto lot 1, the product owner, 08.11.2026, solution C of the study -->
<!-- //// of the open tables): « soit considérer que c'est payé, mettre sur ardoise, offert, perte sur client, annuler ». The cashier picks how the order ends; the manager's PIN is asked -->
<!-- //// where a rule of the authorization gate asks for it (offering, writing off); the server does the rest (pos_next.restaurant.settlement) and keeps a journal. -->
<script setup>
import { Button, Dialog } from "frappe-ui"
import { computed, ref, watch } from "vue"
import { useAuthorization } from "../../composables/useAuthorization"
import { useToast } from "../../composables/useToast"
import { usePOSShiftStore } from "../../stores/posShift"
import { call } from "../../utils/apiWrapper"
import { logger } from "../../utils/logger"
import {
	CANCELLED,
	LOSS,
	OFFERED,
	OFFER_ACTION,
	WRITE_OFF_ACTION,
	formIsComplete,
	issuesOf,
	needsCustomer,
	needsReason,
	settledText,
} from "../../utils/settleOrder"

const log = logger.create("SettleOrderDialog")

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	// A row of `get_open_orders`
	order: { type: Object, default: null },
	formatMoney: { type: Function, default: (value) => String(value) },
})
const emit = defineEmits(["update:modelValue", "settled"])

const { showSuccess, showError } = useToast()
const { requireAuthorization } = useAuthorization()
const shiftStore = usePOSShiftStore()

const open = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
})

const issue = ref("")
const reason = ref("")
const complaint = ref(false)
const customer = ref("")
const customerName = ref("")
const customerQuery = ref("")
const customerChoices = ref([])
const working = ref(false)

const choices = computed(() => issuesOf(props.order))
const chosen = computed(() => choices.value.find((candidate) => candidate.key === issue.value))
const complete = computed(
	() => !working.value && formIsComplete(props.order, { issue: issue.value, reason: reason.value, customer: customer.value }),
)

// A fresh form each time the dialog opens, on the first issue the order allows
watch(
	() => [props.modelValue, props.order?.name],
	([isOpen]) => {
		if (!isOpen) return
		issue.value = choices.value.find((candidate) => candidate.available)?.key || ""
		reason.value = ""
		complaint.value = false
		customer.value = ""
		customerName.value = ""
		customerQuery.value = ""
		customerChoices.value = []
	},
	{ immediate: true },
)

let searching = null
watch(customerQuery, (text) => {
	clearTimeout(searching)
	if (!text || text === customerName.value) {
		customerChoices.value = []
		return
	}
	searching = setTimeout(async () => {
		try {
			const answer = await call("pos_next.api.customers.get_customers", {
				search_term: text,
				pos_profile: shiftStore.profileName,
				limit: 8,
			})
			customerChoices.value = Array.isArray(answer) ? answer : answer?.customers || []
		} catch (error) {
			log.warn("Could not search the customers", error)
			customerChoices.value = []
		}
	}, 250)
})

function pickCustomer(row) {
	customer.value = row.name
	customerName.value = row.customer_name || row.name
	customerQuery.value = customerName.value
	customerChoices.value = []
}

// The manager's approval, where the gate asks for it: a grant for offering the order at its list price, or for writing it off
async function approval() {
	const context = {
		pos_profile: shiftStore.profileName,
		currency: shiftStore.profileCurrency,
	}
	if (issue.value === OFFERED) {
		const grant = await requireAuthorization(OFFER_ACTION, {
			...context,
			amount: props.order.offer_value,
			amountLabel: __("Value offered"),
			actionLabel: __("Offer an item"),
		})
		return grant ? { token: grant.grant_token || undefined } : null
	}
	if (issue.value === LOSS) {
		const grant = await requireAuthorization(WRITE_OFF_ACTION, {
			...context,
			invoice: props.order.name,
			amount: props.order.grand_total,
			amountLabel: __("Total"),
			actionLabel: __("Write off an order"),
		})
		return grant ? { token: grant.grant_token || undefined } : null
	}
	return {}
}

async function settle() {
	if (!complete.value) return
	working.value = true
	try {
		const approved = await approval()
		if (!approved) return
		await call("pos_next.api.restaurant.settle_open_order", {
			invoice: props.order.name,
			issue: issue.value,
			reason: needsReason(issue.value) ? reason.value.trim() : undefined,
			customer: needsCustomer(issue.value) ? customer.value : undefined,
			complaint_filed: issue.value === LOSS && complaint.value ? 1 : 0,
			authorization_token: approved.token,
		})
		showSuccess(settledText(issue.value, props.order.label))
		open.value = false
		emit("settled", { order: props.order.name, issue: issue.value })
	} catch (error) {
		log.warn("Could not settle the order", error)
		showError(error?.messages?.[0] || error?.message || __("The order could not be settled"))
	} finally {
		working.value = false
	}
}
</script>

<template>
	<Dialog v-model="open" :options="{ title: __('Settle {0}', [order?.label || '']), size: 'lg' }">
		<template #body-content>
			<div v-if="order" class="flex flex-col gap-3" data-test="settle-order-dialog">
				<p class="text-sm text-gray-700">
					<span class="font-semibold text-gray-900">{{ order.label }}</span>
					· {{ formatMoney(order.grand_total) }}
				</p>

				<div class="flex flex-col gap-1.5" role="radiogroup">
					<label
						v-for="choice in choices"
						:key="choice.key"
						class="flex items-start gap-2.5 rounded-lg border px-3 py-2"
						:class="[
							choice.available ? 'cursor-pointer border-gray-200' : 'cursor-not-allowed border-gray-100 bg-gray-50 opacity-70',
							issue === choice.key ? 'border-gray-900 bg-gray-50' : '',
						]"
						:data-issue="choice.key"
					>
						<input
							v-model="issue"
							type="radio"
							name="settle-issue"
							class="mt-1"
							:value="choice.key"
							:disabled="!choice.available"
						/>
						<span class="min-w-0">
							<span class="block text-sm font-semibold text-gray-900">{{ choice.label }}</span>
							<span class="block text-xs text-gray-600">{{ choice.available ? choice.hint : choice.why }}</span>
						</span>
					</label>
				</div>

				<div v-if="needsCustomer(issue)" class="flex flex-col gap-1" data-test="settle-customer">
					<label class="text-xs font-semibold text-gray-700" for="settle-customer-search">{{ __("Customer") }}</label>
					<input
						id="settle-customer-search"
						v-model="customerQuery"
						type="search"
						class="rounded-lg border border-gray-300 px-3 py-2 text-sm"
						:placeholder="__('Search a customer')"
						autocomplete="off"
					/>
					<ul v-if="customerChoices.length" class="max-h-40 overflow-y-auto rounded-lg border border-gray-200">
						<li v-for="row in customerChoices" :key="row.name">
							<button
								type="button"
								class="block w-full px-3 py-1.5 text-start text-sm hover:bg-gray-50"
								:data-customer="row.name"
								@click="pickCustomer(row)"
							>
								{{ row.customer_name || row.name }}
							</button>
						</li>
					</ul>
				</div>

				<div v-if="needsReason(issue)" class="flex flex-col gap-1" data-test="settle-reason">
					<label class="text-xs font-semibold text-gray-700" for="settle-reason-text">{{ __("Reason") }}</label>
					<textarea
						id="settle-reason-text"
						v-model="reason"
						rows="2"
						class="rounded-lg border border-gray-300 px-3 py-2 text-sm"
						:placeholder="__('Say why: it is kept in the journal')"
					></textarea>
				</div>

				<label v-if="issue === LOSS" class="flex items-center gap-2 text-sm text-gray-800" data-test="settle-complaint">
					<input v-model="complaint" type="checkbox" />
					{{ __("A complaint was filed") }}
				</label>

				<p v-if="issue === CANCELLED" class="text-xs text-gray-600">
					{{ __("The order is deleted; the journal keeps what it held.") }}
				</p>

				<div class="mt-1 flex justify-end gap-2">
					<Button variant="subtle" @click="open = false">{{ __("Cancel") }}</Button>
					<Button variant="solid" :disabled="!complete" :loading="working" data-test="settle-confirm" @click="settle">
						{{ chosen?.confirm || __("Settle") }}
					</Button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

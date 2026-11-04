<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Scanning in the shop (lot 4, board 8 of the canvas): the seller -->
	<!-- //// checks a cart the customer paid on the phone, line by line, before the customer leaves. All there, the sale is -->
	<!-- //// validated as it was paid, nothing to take; a paid article that is missing is marked and refunded on the payment it -->
	<!-- //// was paid by before the sale is validated; an article found in the bag is scanned in the till, whose payment takes -->
	<!-- //// the difference. A window over the till rather than its centre pane (my choice): the till stays as it is. -->
	<Dialog v-model="open" :options="{ title: title, size: 'lg' }">
		<template #body-content>
			<div v-if="check" class="flex flex-col gap-3">
				<div class="flex flex-wrap items-center gap-2">
					<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-800 dark:text-green-200">
						{{ __("Paid · to check") }}
					</span>
					<span class="text-sm text-gray-600 tabular-nums">
						{{ __("{0} of {1} checked", [decided, check.lines.length]) }}
					</span>
				</div>

				<ul class="flex flex-col border border-gray-200 rounded-lg divide-y divide-gray-100">
					<li v-for="line in check.lines" :key="line.line" class="flex flex-col gap-2 p-3">
						<div class="flex items-center gap-3">
							<input
								:id="`check-${line.line}`"
								v-model="there[line.line]"
								type="checkbox"
								class="h-6 w-6 shrink-0"
								:disabled="missing[line.line] > 0"
								@change="missing[line.line] = 0"
							/>
							<label :for="`check-${line.line}`" class="flex-1 min-w-0 text-sm text-gray-900">
								<span class="font-semibold">{{ line.item_name }}</span>
								<span
									v-if="line.needs_validation"
									class="ms-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 dark:text-amber-200"
								>
									{{ __("To check by a seller") }}
								</span>
							</label>
							<span class="text-sm text-gray-600 tabular-nums">× {{ line.qty }}</span>
							<span class="w-20 text-end text-sm tabular-nums">{{ money(line.amount) }}</span>
						</div>
						<div class="flex items-center gap-2 ps-9">
							<button
								v-if="!missing[line.line]"
								type="button"
								class="text-xs font-semibold text-gray-700 underline"
								@click="markMissing(line)"
							>
								{{ __("Missing") }}
							</button>
							<template v-else>
								<span class="text-xs font-semibold text-red-700 dark:text-red-200">{{ __("Missing:") }}</span>
								<button
									type="button"
									class="h-8 w-8 rounded border border-gray-300"
									:aria-label="__('One less missing')"
									@click="setMissing(line, missing[line.line] - 1)"
								>
									−
								</button>
								<span class="w-6 text-center text-sm tabular-nums">{{ missing[line.line] }}</span>
								<button
									type="button"
									class="h-8 w-8 rounded border border-gray-300"
									:aria-label="__('One more missing')"
									:disabled="missing[line.line] >= line.qty"
									@click="setMissing(line, missing[line.line] + 1)"
								>
									+
								</button>
							</template>
						</div>
					</li>
				</ul>

				<!-- The till's dark theme tints the -50 backgrounds but leaves green and red text dark: a lighter text there -->
				<div class="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900 dark:text-green-200">
					{{ __("Paid on the phone: {0}", [money(check.paid_amount)]) }}
				</div>
				<div
					:class="[
						'flex items-center justify-between rounded-lg px-3 py-2',
						refund > 0 ? 'bg-red-50 text-red-900 dark:text-red-200' : 'bg-orange-50 text-orange-900',
					]"
				>
					<span class="text-sm font-semibold">{{ refund > 0 ? __("To refund") : __("Left to pay") }}</span>
					<span class="text-lg font-bold tabular-nums">{{ money(refund > 0 ? refund : 0) }}</span>
				</div>
				<p v-if="error" class="text-sm text-red-700 dark:text-red-200" role="alert">{{ error }}</p>
			</div>
		</template>
		<template #actions>
			<div class="flex flex-wrap gap-2 w-full">
				<Button variant="subtle" @click="foundInTheBag">{{ __("Article found in the bag") }}</Button>
				<span class="flex-1"></span>
				<Button variant="solid" :disabled="!ready" :loading="busy" @click="validate">
					{{ refund > 0 ? __("Refund {0} and validate", [money(refund)]) : __("All there · Validate the cart") }}
				</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { useToast } from "@/composables/useToast"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { usePOSShiftStore } from "@/stores/posShift"
import { call } from "@/utils/apiWrapper"
import { formatCurrency, roundCurrency, roundTotal } from "@/utils/currency"
import { Button, Dialog } from "frappe-ui"
import { computed, reactive, ref, watch } from "vue"

const cartStore = usePOSCartStore()
const shiftStore = usePOSShiftStore()
const settingsStore = usePOSSettingsStore()
const { showSuccess, showWarning } = useToast()

const check = computed(() => cartStore.shopCartCheck)
const open = computed({
	get: () => Boolean(cartStore.shopCartCheckOpen && cartStore.shopCartCheck),
	set: (value) => cartStore.$patch({ shopCartCheckOpen: value }),
})
const there = reactive({})
const missing = reactive({})
const busy = ref(false)
const error = ref("")

const title = computed(() =>
	__("Check of the cart {0}", [check.value?.code || ""]),
)
// A line is decided once it is ticked there or marked missing
const decided = computed(
	() =>
		(check.value?.lines || []).filter(
			(line) => there[line.line] || missing[line.line] > 0,
		).length,
)
const ready = computed(
	() =>
		Boolean(check.value?.lines.length) &&
		decided.value === check.value.lines.length &&
		!busy.value,
)
// What the missing articles were paid, refunded on the payment of the phone: what was paid less what the till takes for
// what is left, its total rounded as the till rounds it (CHF 0.05), as the server refunds it (shop_scan.control.validate)
const refund = computed(() => {
	const missingAmount = (check.value?.lines || []).reduce(
		(sum, line) =>
			sum +
			(Number(missing[line.line]) || 0) *
				(Number(line.amount) / Number(line.qty || 1)),
		0,
	)
	if (missingAmount <= 0) return 0
	const left = Number(check.value?.grand_total || 0) - missingAmount
	const due = settingsStore.disableRoundedTotal ? left : roundTotal(left)
	return Math.max(0, roundCurrency(Number(check.value?.paid_amount || 0) - due))
})

function money(value) {
	return formatCurrency(
		value,
		check.value?.currency || shiftStore.profileCurrency || undefined,
	)
}

function markMissing(line) {
	there[line.line] = false
	missing[line.line] = Number(line.qty) || 1
}

function setMissing(line, count) {
	missing[line.line] = Math.max(0, Math.min(Number(line.qty) || 1, count))
}

// A new cart to check starts with nothing decided
watch(
	() => check.value?.code,
	() => {
		for (const key of Object.keys(there)) delete there[key]
		for (const key of Object.keys(missing)) delete missing[key]
		error.value = ""
	},
)

function foundInTheBag() {
	cartStore.$patch({ shopCartCheckOpen: false })
	showWarning(__("Scan the article: the customer pays the rest at the till."))
}

async function validate() {
	busy.value = true
	error.value = ""
	const lines = (check.value?.lines || [])
		.filter((line) => missing[line.line] > 0)
		.map((line) => ({ line: line.line, qty: missing[line.line] }))
	try {
		const answer = await call("pos_next.api.shop_scan.validate_shop_cart", {
			code: check.value.code,
			pos_profile: shiftStore.profileName,
			missing: lines.length ? JSON.stringify(lines) : null,
			pos_opening_shift: cartStore.posOpeningShift || null,
		})
		const code = check.value.code
		await cartStore.clearCart({ returnSerials: false })
		showSuccess(
			answer?.refunded > 0
				? __("Cart {0} validated, {1} refunded.", [
						code,
						money(answer.refunded),
					])
				: __("Cart {0} validated.", [code]),
		)
	} catch (failure) {
		error.value = failure?.message || __("The cart could not be validated.")
	} finally {
		busy.value = false
	}
}
</script>

<template>
	<div class="flex flex-col h-full bg-gray-50 overflow-hidden">
		<!-- No Order Yet -->
		<div v-if="orderItems.length === 0 && !guestStore.isLoading" class="flex-1 flex flex-col items-center justify-center p-8 text-gray-400">
			<svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
			</svg>
			<p class="text-base font-medium text-gray-500">{{ __('No order yet') }}</p>
			<p class="text-sm text-gray-400 mt-1">{{ __('Send your order first, then pay here') }}</p>
		</div>

		<!-- Checkout Content -->
		<template v-else>
			<!-- Order Summary -->
			<div class="bg-white border-b border-gray-200 p-4 flex-shrink-0">
				<h3 class="text-sm font-semibold text-gray-700 mb-2">{{ __('Order Summary') }}</h3>
				<div class="space-y-1">
					<div
						v-for="(oItem, idx) in orderItems"
						:key="idx"
						class="flex items-center justify-between text-sm"
					>
						<span class="text-gray-700">{{ oItem.qty }}× {{ oItem.item_name }}</span>
						<span class="text-gray-900 font-medium">{{ formatPrice(oItem.amount ?? oItem.qty * oItem.rate) }}</span>
					</div>
				</div>
				<div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
					<span class="text-sm font-semibold text-gray-900">{{ __('Total') }}</span>
					<span class="text-base font-bold text-gray-900">{{ formatPrice(guestStore.orderTotal) }}</span>
				</div>
				<!-- Paid / Remaining -->
				<div v-if="guestStore.paidAmount > 0" class="mt-1 space-y-0.5">
					<div class="flex items-center justify-between text-xs text-green-700">
						<span>{{ __('Paid') }}</span>
						<span>{{ formatPrice(guestStore.paidAmount) }}</span>
					</div>
					<div v-if="!guestStore.isFullyPaid" class="flex items-center justify-between text-xs text-orange-600 font-semibold">
						<span>{{ __('Remaining') }}</span>
						<span>{{ formatPrice(guestStore.remainingAmount) }}</span>
					</div>
				</div>
			</div>

			<!-- Fully Paid -->
			<div v-if="guestStore.isFullyPaid" class="flex-1 flex flex-col items-center justify-center p-8">
				<div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
					<svg class="w-9 h-9 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
					</svg>
				</div>
				<p class="text-xl font-bold text-green-700">{{ __('Payment complete') }}</p>
				<p class="text-sm text-gray-500 mt-1">{{ __('Thank you for your order!') }}</p>
			</div>

			<!-- Payment Tabs -->
			<template v-else>
				<!-- Tab switcher -->
				<div class="flex bg-white border-b border-gray-200 flex-shrink-0">
					<button
						@click="activeTab = 'amount'"
						:class="[
							'flex-1 py-3 text-sm font-medium transition-colors border-b-2',
							activeTab === 'amount'
								? 'border-blue-600 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700',
						]"
					>
						{{ __('Pay Amount') }}
					</button>
					<button
						@click="activeTab = 'items'"
						:class="[
							'flex-1 py-3 text-sm font-medium transition-colors border-b-2',
							activeTab === 'items'
								? 'border-blue-600 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700',
						]"
					>
						{{ __('Pay by Items') }}
					</button>
				</div>

				<!-- Tab: Pay Amount (free entry) -->
				<div v-if="activeTab === 'amount'" class="flex-1 overflow-y-auto p-4">
					<label class="block text-sm font-medium text-gray-700 mb-2">
						{{ __('Amount to pay') }}
					</label>
					<div class="relative">
						<span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-lg font-medium">
							{{ currencySymbol }}
						</span>
						<input
							v-model="freeAmount"
							type="number"
							step="0.01"
							:min="0"
							:max="guestStore.remainingAmount"
							:placeholder="`${guestStore.remainingAmount.toFixed(2)}`"
							class="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-xl text-lg font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						/>
					</div>
					<p class="text-xs text-gray-500 mt-1">
						{{ __('Remaining: {0}', [formatPrice(guestStore.remainingAmount)]) }}
					</p>
				</div>

				<!-- Tab: Pay by Items -->
				<div v-else class="flex-1 overflow-y-auto p-4">
					<div class="space-y-2">
						<label
							v-for="(oItem, idx) in orderItems"
							:key="idx"
							class="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl cursor-pointer"
							:class="selectedItemIndexes.has(idx) ? 'border-blue-500 bg-blue-50' : ''"
						>
							<input
								type="checkbox"
								:checked="selectedItemIndexes.has(idx)"
								@change="toggleItemSelection(idx)"
								:disabled="(oItem.is_paid)"
								class="w-4 h-4 text-blue-600 rounded flex-shrink-0"
							/>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-gray-900 truncate">
									{{ oItem.qty }}× {{ oItem.item_name }}
								</p>
							</div>
							<span class="text-sm font-semibold text-gray-900 flex-shrink-0">
								{{ formatPrice(oItem.amount ?? oItem.qty * oItem.rate) }}
							</span>
						</label>
					</div>
					<div v-if="itemsPayAmount > 0" class="mt-3 p-3 bg-blue-50 rounded-xl flex items-center justify-between">
						<span class="text-sm font-medium text-blue-700">{{ __('Selected total') }}</span>
						<span class="text-base font-bold text-blue-700">{{ formatPrice(itemsPayAmount) }}</span>
					</div>
				</div>

				<!-- Footer -->
				<div class="bg-white border-t border-gray-200 p-4 flex-shrink-0">
					<!-- Account creation step (optional/mandatory) -->
					<div
						v-if="showAccountStep"
						class="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2"
					>
						<p class="text-sm font-semibold text-gray-700">
						{{ isAccountMandatory ? __('Create an account (required)') : __('Create an account (optional)') }}
					</p>
						<input
							v-model="accountName"
							type="text"
							:placeholder="__('Your name')"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
						<input
							v-model="accountEmail"
							type="email"
							:placeholder="__('Email')"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
						<input
							v-model="accountPhone"
							type="tel"
							:placeholder="__('Phone (optional)')"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<!-- Error display -->
					<div v-if="guestStore.error" class="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
						<p class="text-xs text-red-600">{{ guestStore.error }}</p>
					</div>

					<!-- Payment status banner -->
					<div v-if="paymentState === 'pending'" class="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-2">
						<svg class="w-4 h-4 text-yellow-600 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
						</svg>
						<p class="text-sm text-yellow-700">{{ __('Processing payment...') }}</p>
					</div>

					<!-- Wallee payment iframe -->
					<div v-if="walleeUrl" class="mb-3 border border-gray-200 rounded-xl overflow-hidden">
						<iframe
							:src="walleeUrl"
							class="w-full"
							style="height: 300px; border: none;"
							:title="__('Payment form')"
						></iframe>
					</div>

					<!-- Pay button -->
					<button
						v-if="!walleeUrl"
						@click="handlePay"
						:disabled="guestStore.isLoading || payableAmount === 0 || !isAccountValid"
						class="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
					>
						<svg v-if="guestStore.isLoading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
						</svg>
						<span>{{ __('Pay {0}', [formatPrice(payableAmount)]) }}</span>
					</button>
					<button
						v-else
						@click="cancelPayment"
						class="w-full py-3 border border-gray-300 text-gray-700 font-medium rounded-xl active:bg-gray-50 transition-colors"
					>
						{{ __('Cancel') }}
					</button>
				</div>
			</template>
		</template>
	</div>
</template>

<script setup>
import { ref, computed } from "vue"
import { useGuestOrderStore } from "@/stores/guestOrder"

const emit = defineEmits(["order-confirmed"])

const guestStore = useGuestOrderStore()

const activeTab = ref("amount")
const freeAmount = ref("")
const selectedItemIndexes = ref(new Set())
const paymentState = ref(null) // null | 'pending' | 'success' | 'failed'
const walleeUrl = ref(null)

// Account creation fields
const accountName = ref("")
const accountEmail = ref("")
const accountPhone = ref("")

const orderItems = computed(() => guestStore.orderItems)
const isAccountMandatory = computed(() => {
	return guestStore.settings?.guest_account_mode === "Mandatory"
})

const showAccountStep = computed(() => {
	const mode = guestStore.settings?.guest_account_mode
	return mode === "Optional" || mode === "Mandatory"
})

const isAccountValid = computed(() => {
	if (!isAccountMandatory.value) return true
	return accountName.value.trim() && accountEmail.value.trim()
})

const currencySymbol = computed(() => {
	try {
		return (
			new Intl.NumberFormat(undefined, {
				style: "currency",
				currency: window.frappe?.boot?.sysdefaults?.currency || "EUR",
			})
				.formatToParts(0)
				.find((p) => p.type === "currency")?.value ?? "€"
		)
	} catch {
		return "€"
	}
})

const itemsPayAmount = computed(() => {
	return [...selectedItemIndexes.value].reduce((sum, idx) => {
		const item = orderItems.value[idx]
		return sum + (item?.amount ?? (item?.qty ?? 0) * (item?.rate ?? 0))
	}, 0)
})

const payableAmount = computed(() => {
	if (activeTab.value === "amount") {
		const v = Number.parseFloat(freeAmount.value)
		return Number.isNaN(v)
			? guestStore.remainingAmount
			: Math.min(v, guestStore.remainingAmount)
	}
	return itemsPayAmount.value
})

const selectedItemsForPayment = computed(() => {
	if (activeTab.value !== "items") return []
	return [...selectedItemIndexes.value].map((idx) => orderItems.value[idx])
})

function formatPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: window.frappe?.boot?.sysdefaults?.currency || "EUR",
		minimumFractionDigits: 2,
	}).format(amount)
}

function toggleItemSelection(idx) {
	const next = new Set(selectedItemIndexes.value)
	if (next.has(idx)) {
		next.delete(idx)
	} else {
		next.add(idx)
	}
	selectedItemIndexes.value = next
}

async function handlePay() {
	if (payableAmount.value <= 0) return
	paymentState.value = "pending"
	walleeUrl.value = null

	try {
		const items =
			activeTab.value === "items" ? selectedItemsForPayment.value : []
		const result = await guestStore.createPayment(payableAmount.value, items)
		if (result?.payment_url) {
			walleeUrl.value = result.payment_url
			// Poll order status while iframe is open to detect payment completion
			startPaymentPolling()
		} else if (result?.success) {
			paymentState.value = "success"
			await guestStore.refreshOrderStatus()
			if (result?.invoice) {
				emit("order-confirmed", result.invoice)
			}
		}
	} catch {
		paymentState.value = "failed"
	}
}

// Poll order status every 5s while Wallee iframe is open
let _pollInterval = null

function startPaymentPolling() {
	stopPaymentPolling()
	_pollInterval = setInterval(async () => {
		await guestStore.refreshOrderStatus()
		if (guestStore.isFullyPaid || guestStore.paidAmount > 0) {
			// Payment detected via backend
			stopPaymentPolling()
			walleeUrl.value = null
			paymentState.value = "success"
			emit("order-confirmed", guestStore.orderItems?.[0]?.parent || "")
		}
	}, 5000)
}

function stopPaymentPolling() {
	if (_pollInterval) {
		clearInterval(_pollInterval)
		_pollInterval = null
	}
}

function cancelPayment() {
	stopPaymentPolling()
	walleeUrl.value = null
	paymentState.value = null
}
</script>

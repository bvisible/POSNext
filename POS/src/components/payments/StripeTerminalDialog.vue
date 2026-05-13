<!--
  StripeTerminalDialog
  --------------------
  Modal dialog shown while a Stripe Terminal payment is in progress.
  The cashier sees a card-tap illustration + spinner + cancel button while
  the customer presents their card on the reader. State transitions arrive
  via SocketIO (`payment.intent.<name>.updated`) and are reflected by
  re-fetching `pos_get_intent_status` (`usePaymentDriver`).

  Props:
    - intent (required): the Payment Intent payload returned by pos_start_payment
    - readerLabel (optional): human-readable reader label to display
  Emits:
    - close → user closed without action
    - cancel → user clicked the cancel button (parent calls usePaymentDriver.cancel)
    - succeeded → status reached succeeded
    - failed → status reached failed
-->
<template>
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
		<div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
			<header class="flex items-center justify-between px-5 py-4 border-b border-gray-200">
				<div>
					<h2 class="text-lg font-bold text-gray-900">{{ __('Card Payment') }}</h2>
					<p v-if="readerLabel" class="text-sm text-gray-500">{{ readerLabel }}</p>
				</div>
				<button
					@click="$emit('close')"
					class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
					:aria-label="__('Close')"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>
			</header>

			<section class="px-6 py-8 text-center">
				<div class="mx-auto mb-6 w-32 h-32 rounded-full flex items-center justify-center"
					:class="iconBgClass">
					<!-- Animated card icon while processing -->
					<svg v-if="isProcessing" class="w-16 h-16 text-blue-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<rect x="2" y="6" width="20" height="13" rx="2" stroke-width="1.5"/>
						<line x1="2" y1="10" x2="22" y2="10" stroke-width="1.5"/>
					</svg>
					<svg v-else-if="status === 'succeeded'" class="w-16 h-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
					</svg>
					<svg v-else-if="status === 'failed' || status === 'canceled'" class="w-16 h-16 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</div>

				<p class="text-lg font-semibold text-gray-900 mb-2">{{ headline }}</p>
				<p v-if="subline" class="text-sm text-gray-500">{{ subline }}</p>

				<div v-if="intent?.amount && intent?.currency" class="mt-4 text-3xl font-bold text-gray-900">
					{{ formatAmount(intent.amount, intent.currency) }}
				</div>
			</section>

			<footer class="flex gap-2 px-5 py-4 border-t border-gray-200">
				<button
					v-if="isProcessing"
					@click="$emit('cancel')"
					class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200"
				>
					{{ __('Cancel') }}
				</button>
				<button
					v-else
					@click="$emit('close')"
					class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
				>
					{{ __('Close') }}
				</button>
			</footer>
		</div>
	</div>
</template>

<script setup>
import { computed, watch } from "vue"

const props = defineProps({
	intent: { type: Object, required: true },
	readerLabel: { type: String, default: "" },
})

const emit = defineEmits(["close", "cancel", "succeeded", "failed"])

const status = computed(() => props.intent?.status ?? "requires_action")
const isProcessing = computed(() => status.value === "requires_action" || status.value === "processing")

const headline = computed(() => {
	switch (status.value) {
		case "requires_action":
			return __("Present card on reader")
		case "processing":
			return __("Processing payment…")
		case "succeeded":
			return __("Payment successful")
		case "failed":
			return __("Payment failed")
		case "canceled":
			return __("Payment canceled")
		default:
			return status.value
	}
})

const subline = computed(() => {
	if (status.value === "failed" && props.intent?.error_message) {
		return props.intent.error_message
	}
	if (status.value === "requires_action") {
		return __("Tap, insert or swipe the card on the terminal")
	}
	return ""
})

const iconBgClass = computed(() => {
	switch (status.value) {
		case "succeeded":
			return "bg-green-100"
		case "failed":
		case "canceled":
			return "bg-red-100"
		default:
			return "bg-blue-50"
	}
})

function formatAmount(amount, currency) {
	// Amount is in smallest unit. Most CHF/EUR/USD use 2 decimals.
	const major = Number(amount) / 100
	const formatter = new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency || "CHF",
	})
	return formatter.format(major)
}

// Bubble terminal-state events for the parent to react.
watch(status, (s) => {
	if (s === "succeeded") emit("succeeded")
	else if (s === "failed") emit("failed")
})

// i18n helper (Frappe wraps __ on window).
function __(s) {
	return typeof window !== "undefined" && window.__ ? window.__(s) : s
}
</script>

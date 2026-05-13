<!--
  TwintQRDialog
  -------------
  Modal dialog shown while a TWINT QR payment is in progress.
  Renders the `pairing_token` returned by the TWINT bridge as a QR code that
  the customer scans with the TWINT app. Status is updated via SocketIO
  (`payment.intent.<name>.updated`) which triggers a refresh of the intent.

  Props:
    - intent (required): the Payment Intent payload (contains next_action_payload.pairing_token)
  Emits:
    - close → user closed without action
    - cancel → user clicked the cancel button
    - succeeded → status reached succeeded
    - failed → status reached failed
-->
<template>
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
		<div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
			<header class="flex items-center justify-between px-5 py-4 border-b border-gray-200">
				<div>
					<h2 class="text-lg font-bold text-gray-900">{{ __('Pay with TWINT') }}</h2>
					<p class="text-sm text-gray-500">{{ __('Scan with the TWINT app') }}</p>
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

			<section class="px-6 py-6 text-center">
				<!-- QR area -->
				<div v-if="isProcessing" class="relative mx-auto mb-4 w-64 h-64 bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden">
					<canvas ref="qrCanvas" class="w-full h-full" />
					<div v-if="!qrReady" class="absolute inset-0 flex items-center justify-center text-gray-400">
						{{ __('Generating QR…') }}
					</div>
				</div>

				<!-- Terminal-state visuals -->
				<div v-else-if="status === 'succeeded'" class="mx-auto mb-4 w-32 h-32 rounded-full bg-green-100 flex items-center justify-center">
					<svg class="w-16 h-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
					</svg>
				</div>
				<div v-else class="mx-auto mb-4 w-32 h-32 rounded-full bg-red-100 flex items-center justify-center">
					<svg class="w-16 h-16 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
import { computed, onMounted, ref, watch, nextTick } from "vue"
import QRCode from "qrcode"

const props = defineProps({
	intent: { type: Object, required: true },
})

const emit = defineEmits(["close", "cancel", "succeeded", "failed"])

const qrCanvas = ref(null)
const qrReady = ref(false)

const status = computed(() => props.intent?.status ?? "requires_action")
const isProcessing = computed(() => status.value === "requires_action" || status.value === "processing")

const pairingToken = computed(() => {
	const payload = props.intent?.next_action_payload
	if (typeof payload === "string") {
		try { return JSON.parse(payload).pairing_token } catch (e) { return null }
	}
	return payload?.pairing_token ?? null
})

const headline = computed(() => {
	switch (status.value) {
		case "requires_action":
			return __("Scan to pay")
		case "processing":
			return __("Confirming with TWINT…")
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
		return __("Open your TWINT app and point your camera at the code")
	}
	return ""
})

async function renderQR() {
	if (!pairingToken.value || !qrCanvas.value) return
	try {
		await QRCode.toCanvas(qrCanvas.value, pairingToken.value, {
			errorCorrectionLevel: "M",
			margin: 2,
			width: 256,
			color: { dark: "#000000", light: "#FFFFFF" },
		})
		qrReady.value = true
	} catch (e) {
		// Fail silently — the customer can manually open TWINT if QR rendering breaks.
		console.error("[TwintQRDialog] QR render failed", e)
		qrReady.value = false
	}
}

function formatAmount(amount, currency) {
	const major = Number(amount) / 100
	const formatter = new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency || "CHF",
	})
	return formatter.format(major)
}

function __(s) {
	return typeof window !== "undefined" && window.__ ? window.__(s) : s
}

onMounted(() => nextTick(renderQR))
watch(pairingToken, () => nextTick(renderQR))
watch(status, (s) => {
	if (s === "succeeded") emit("succeeded")
	else if (s === "failed") emit("failed")
})
</script>

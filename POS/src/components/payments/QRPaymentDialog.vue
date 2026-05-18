<!--
  QRPaymentDialog
  ---------------
  PSP-agnostic dialog for QR-based payments (TWINT via PHP bridge, future
  PayLink etc.). Same lifecycle and prop shape as CardPresentDialog so the
  parent's wiring is symmetric, minus the terminal selector (QR is generated
  server-side, no physical device to pick).

  Lifecycle (driven by props.intent + props.inFlight):
    1. idle        → no intent yet. Cashier enters an amount via the numpad
                     and clicks "Démarrer". Component emits `start({amount})`.
    2. creating    → inFlight is true, brief spinner while the parent awaits
                     pos_start_payment (the TWINT bridge generates the QR).
    3. processing  → intent.status is requires_action/processing. QR is
                     rendered from `intent.next_action_payload.pairing_token`.
                     Customer scans with the TWINT app.
    4. succeeded / failed / canceled → terminal visuals.

  Props: see CardPresentDialog for the shared shape. defaultDevice / provider
  do exist on the props but are unused here (kept for prop symmetry).

  Emits: same as CardPresentDialog (start, cancel, close, succeeded, failed).
-->
<template>
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
		<div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
			<header class="flex items-center justify-between px-5 py-4 border-b border-gray-200">
				<div>
					<h2 class="text-lg font-bold text-gray-900">{{ __('QR Payment') }}</h2>
					<p class="text-sm text-gray-500">
						{{ headerSubtitle }}
					</p>
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

			<!-- ============ IDLE STATE: amount entry + (optional) endpoint picker ============ -->
			<section v-if="isIdle" class="px-5 py-5">
				<!-- Amount display -->
				<div class="bg-gray-100 rounded-xl py-4 px-4 mb-4 text-center">
					<div class="text-xs uppercase tracking-wide text-gray-500 mb-1">
						{{ __('Amount to charge') }}
					</div>
					<div class="text-3xl font-bold text-gray-900">
						{{ formatMajor(parsedAmount, currency) }}
					</div>
				</div>

				<!-- Endpoint selector (only when > 1 active row matches this Mode of
				     Payment). For TWINT today this is rarely > 1, but kept symmetric
				     with CardPresentDialog so a future multi-merchant TWINT config
				     can surface here without UI changes. -->
				<div v-if="loadingDevices" class="mb-4 text-center text-sm text-gray-500">
					{{ __('Loading…') }}
				</div>
				<div v-else-if="devicesError" class="mb-4 text-center text-sm text-red-600">
					{{ devicesError }}
				</div>
				<div v-else-if="availableDevices.length > 1" class="mb-4">
					<div class="text-xs uppercase tracking-wide text-gray-500 mb-2">
						{{ __('Endpoint') }}
					</div>
					<div class="grid grid-cols-2 gap-2">
						<button
							v-for="dev in availableDevices"
							:key="dev.name"
							type="button"
							@click="selectedDevice = dev.name"
							:class="[
								'relative rounded-xl border-2 px-3 py-2.5 text-left transition-all min-h-[58px]',
								selectedDevice === dev.name
									? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
									: 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 text-gray-700',
							]"
						>
							<svg
								v-if="selectedDevice === dev.name"
								class="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-blue-600"
								fill="none" stroke="currentColor" viewBox="0 0 24 24"
							>
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
							</svg>
							<span class="block text-sm font-semibold leading-tight pr-4">{{ dev.device_label || dev.name }}</span>
						</button>
					</div>
				</div>

				<!-- Quick-amount buttons -->
				<div class="grid grid-cols-4 gap-2 mb-3">
					<button
						v-for="qa in quickAmounts"
						:key="qa"
						type="button"
						@click="setAmount(qa)"
						class="py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-blue-50 hover:border-blue-300"
					>
						{{ formatMajor(qa, currency) }}
					</button>
				</div>

				<!-- Numpad -->
				<div class="grid grid-cols-3 gap-2 mb-4">
					<button v-for="n in ['7','8','9','4','5','6','1','2','3']" :key="n"
						type="button"
						@click="numpadInput(n)"
						class="py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-lg font-semibold text-gray-900"
					>{{ n }}</button>
					<button type="button" @click="numpadInput('00')"
						class="py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-lg font-semibold text-gray-900"
					>00</button>
					<button type="button" @click="numpadInput('0')"
						class="py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-lg font-semibold text-gray-900"
					>0</button>
					<button type="button" @click="numpadInput('.')"
						class="py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-lg font-semibold text-gray-900"
					>.</button>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<button type="button" @click="numpadBackspace"
						class="py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700"
					>{{ __('⌫ Backspace') }}</button>
					<button type="button" @click="numpadClear"
						class="py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700"
					>{{ __('Clear') }}</button>
				</div>
			</section>

			<!-- ============ CREATING / PROCESSING / TERMINAL state ============ -->
			<section v-else class="px-6 py-6 text-center">
				<!-- QR area (only when intent is in processing/requires_action AND we have a token) -->
				<div v-if="isProcessing && pairingToken" class="relative mx-auto mb-4 w-64 h-64 bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden">
					<canvas ref="qrCanvas" class="w-full h-full" />
					<div v-if="!qrReady" class="absolute inset-0 flex items-center justify-center text-gray-400">
						{{ __('Generating QR…') }}
					</div>
				</div>

				<!-- Creating / awaiting payload state -->
				<div v-else-if="isCreating || (isProcessing && !pairingToken)" class="mx-auto mb-4 w-32 h-32 rounded-full bg-blue-50 flex items-center justify-center">
					<svg class="w-16 h-16 text-blue-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<rect x="3" y="3" width="7" height="7" stroke-width="1.5"/>
						<rect x="14" y="3" width="7" height="7" stroke-width="1.5"/>
						<rect x="3" y="14" width="7" height="7" stroke-width="1.5"/>
						<line x1="14" y1="14" x2="21" y2="14" stroke-width="1.5"/>
						<line x1="14" y1="18" x2="21" y2="18" stroke-width="1.5"/>
					</svg>
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

				<div v-if="amountForDisplay" class="mt-4 text-3xl font-bold text-gray-900">
					{{ formatMinor(amountForDisplay, displayCurrency) }}
				</div>

				<!-- Simulator controls — test mode only (TWINT has no physical device
				     to "simulate"; this just drives the Frappe FSM + SocketIO so the
				     UI flow can be validated without round-tripping the bridge). -->
				<div
					v-if="showSimulatorControls"
					class="mt-6 mx-auto max-w-sm border-2 border-amber-300 bg-amber-50 rounded-xl p-4 text-left"
				>
					<div class="flex items-center gap-2 mb-3">
						<span class="text-base">🧪</span>
						<span class="text-xs uppercase tracking-wide font-bold text-amber-700">
							{{ __('Simulator (test mode)') }}
						</span>
					</div>
					<p class="text-xs text-amber-800 mb-3">
						{{ __('No customer scan will happen. Pick an outcome to advance the Payment Intent FSM.') }}
					</p>
					<div class="grid grid-cols-2 gap-2">
						<button
							type="button"
							@click="simulate('succeeded')"
							:disabled="simulatorBusy"
							class="py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed"
						>
							{{ simulatorBusy === 'succeeded' ? __('…') : __('✓ Accept') }}
						</button>
						<button
							type="button"
							@click="simulate('declined')"
							:disabled="simulatorBusy"
							class="py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
						>
							{{ simulatorBusy === 'declined' ? __('…') : __('✗ Decline') }}
						</button>
					</div>
					<p v-if="simulatorError" class="mt-2 text-xs text-red-700">{{ simulatorError }}</p>
				</div>
			</section>

			<!-- ============ FOOTER ============ -->
			<footer class="flex gap-2 px-5 py-4 border-t border-gray-200">
				<template v-if="isIdle">
					<button
						type="button"
						@click="$emit('cancel')"
						class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200"
					>
						{{ __('Cancel') }}
					</button>
					<button
						type="button"
						@click="onStart"
						:disabled="!canStart"
						:class="[
							'flex-1 py-3 rounded-xl font-semibold transition-colors',
							canStart
								? 'bg-blue-600 text-white hover:bg-blue-700'
								: 'bg-gray-200 text-gray-400 cursor-not-allowed',
						]"
					>
						{{ __('Generate QR') }}
					</button>
				</template>
				<template v-else>
					<button
						v-if="isCreating || isProcessing"
						type="button"
						@click="$emit('cancel')"
						class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-800 font-semibold hover:bg-gray-200"
					>
						{{ __('Cancel') }}
					</button>
					<button
						v-else
						type="button"
						@click="$emit('close')"
						class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
					>
						{{ __('Close') }}
					</button>
				</template>
			</footer>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue"
import QRCode from "qrcode"
import { call } from "frappe-ui"

const props = defineProps({
	// Idle-state config (subset of CardPresentDialog props for parent symmetry)
	posProfile: { type: String, default: "" },
	modeOfPayment: { type: String, default: "" },
	defaultAmount: { type: Number, default: 0 },
	currency: { type: String, default: "CHF" },
	provider: { type: String, default: "" },
	channel: { type: String, default: "" },
	defaultDevice: { type: String, default: null }, // unused for QR — kept for symmetry
	// True when the provider's mode == "test" — gates the simulator panel.
	isTestMode: { type: Boolean, default: false },
	// In-flight / terminal-state inputs
	intent: { type: Object, default: null },
	inFlight: { type: Boolean, default: false },
})

const emit = defineEmits(["start", "cancel", "close", "succeeded", "failed"])

// -------- State computed from props --------
const isIdle = computed(() => !props.intent && !props.inFlight)
const isCreating = computed(() => props.inFlight && !props.intent)
const status = computed(() => props.intent?.status ?? null)
const isProcessing = computed(
	() => status.value === "requires_action" || status.value === "processing",
)

// -------- Amount entry (idle) --------
const amountInput = ref(formatForInput(props.defaultAmount || 0))
const parsedAmount = computed(() => {
	const n = Number.parseFloat(amountInput.value)
	return Number.isFinite(n) && n > 0 ? n : 0
})

// -------- Endpoint list (idle) --------
// QR channels (TWINT) typically have ONE virtual row from the backend (a row
// in POS Profile → Active Payment Methods & Terminals with no Payment Device).
// We still go through pos_get_active_devices so that:
//   - missing/misconfigured profiles surface a clear error,
//   - future multi-merchant TWINT configs can show a picker without UI churn.
const availableDevices = ref([])
const selectedDevice = ref(null)
const loadingDevices = ref(false)
const devicesError = ref("")

async function loadDevices() {
	if (!props.posProfile) return
	loadingDevices.value = true
	devicesError.value = ""
	try {
		const rows = await call("pos_next.api.payments.pos_get_active_devices", {
			pos_profile: props.posProfile,
			mode_of_payment: props.modeOfPayment || null,
			provider: props.provider || null,
			channel: props.channel || null,
		})
		availableDevices.value = Array.isArray(rows) ? rows : rows?.message || []
		const def = availableDevices.value.find((d) => d.is_default)
		selectedDevice.value = def?.name || availableDevices.value[0]?.name || null
		if (!availableDevices.value.length) {
			devicesError.value = __(
				"This Mode of Payment is not enabled on the POS Profile. Add a row in POS Profile → Active Payment Methods & Terminals.",
			)
		}
	} catch (e) {
		devicesError.value = e?.message || __("Failed to load payment endpoints")
		availableDevices.value = []
	} finally {
		loadingDevices.value = false
	}
}

onMounted(loadDevices)
watch(
	() => [props.posProfile, props.modeOfPayment, props.provider, props.channel],
	() => loadDevices(),
)

const canStart = computed(
	() =>
		parsedAmount.value > 0 &&
		!loadingDevices.value &&
		!devicesError.value &&
		availableDevices.value.length > 0,
)

function formatForInput(n) {
	const v = Number(n)
	if (!Number.isFinite(v) || v <= 0) return "0"
	return v.toFixed(2)
}

function numpadInput(token) {
	const cur = amountInput.value || ""
	if (token === ".") {
		if (cur.includes(".")) return
		amountInput.value = cur === "" ? "0." : cur + "."
		return
	}
	if (cur === "0") {
		amountInput.value = token === "00" ? "0" : token
		return
	}
	amountInput.value = (cur === "" ? "" : cur) + token
}

function numpadBackspace() {
	const cur = amountInput.value || ""
	amountInput.value = cur.length > 1 ? cur.slice(0, -1) : "0"
}

function numpadClear() {
	amountInput.value = "0"
}

function setAmount(major) {
	amountInput.value = formatForInput(major)
}

const quickAmounts = computed(() => {
	const base = Math.max(0, Number(props.defaultAmount) || 0)
	if (base <= 0) return [10, 20, 50, 100]
	const ceil10 = Math.ceil(base / 10) * 10
	return [
		Number(base.toFixed(2)),
		ceil10 > base ? ceil10 : ceil10 + 10,
		ceil10 > base ? ceil10 + 10 : ceil10 + 20,
		ceil10 > base ? ceil10 + 20 : ceil10 + 50,
	]
})

// Refresh the input default amount if it changes
watch(
	() => props.defaultAmount,
	(v) => {
		if (isIdle.value && parsedAmount.value === 0) {
			amountInput.value = formatForInput(v || 0)
		}
	},
)

function onStart() {
	if (!canStart.value) return
	// Virtual rows (TWINT QR + future bank QRs) carry a `virtual:` prefix in
	// their `name`. The backend (pos_start_payment) normalizes those to None
	// so the Payment Intent is created without a device attached. Real
	// devices (theoretical for QR channels today) flow through unchanged.
	emit("start", {
		amount: parsedAmount.value,
		device: selectedDevice.value,
	})
}

// -------- Simulator controls (test mode) --------
// QR providers (TWINT) have no "simulator device" concept like Stripe Terminal,
// but the same Accept/Decline panel is useful while waiting for a real sandbox
// merchant. Backend (pos_simulate_terminal_outcome) skips Stripe-specific
// calls for channel=qr_bridge and just transitions the Frappe FSM + publishes
// the SocketIO event, which is what the UI flow actually needs.
const showSimulatorControls = computed(
	() => !!props.intent && isProcessing.value && props.isTestMode,
)
const simulatorBusy = ref(null) // null | "succeeded" | "declined"
const simulatorError = ref("")

async function simulate(outcome) {
	if (!props.intent?.intent_name) return
	if (simulatorBusy.value) return
	simulatorBusy.value = outcome
	simulatorError.value = ""
	try {
		await call("pos_next.api.payments.pos_simulate_terminal_outcome", {
			intent_name: props.intent.intent_name,
			outcome,
		})
	} catch (e) {
		simulatorError.value = e?.message || __("Simulator call failed")
	} finally {
		simulatorBusy.value = null
	}
}

// -------- QR rendering (processing state) --------
const qrCanvas = ref(null)
const qrReady = ref(false)

const pairingToken = computed(() => {
	const payload = props.intent?.next_action_payload
	if (typeof payload === "string") {
		try {
			return JSON.parse(payload).pairing_token
		} catch (e) {
			return null
		}
	}
	return payload?.pairing_token ?? null
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
		console.error("[QRPaymentDialog] QR render failed", e)
		qrReady.value = false
	}
}

onMounted(() => nextTick(renderQR))
watch(pairingToken, () => nextTick(renderQR))

// -------- Headline / subtitle --------
const headerSubtitle = computed(() => {
	if (isIdle.value) return props.modeOfPayment || __("Enter amount and generate the QR")
	if (isCreating.value) return __("Generating QR…")
	if (isProcessing.value) return __("Scan with the TWINT app")
	return props.modeOfPayment || ""
})

const headline = computed(() => {
	if (isCreating.value) return __("Preparing the QR…")
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
			return status.value || ""
	}
})

const subline = computed(() => {
	if (isCreating.value) return __("Please wait a moment.")
	if (status.value === "failed" && props.intent?.error_message) {
		return props.intent.error_message
	}
	if (status.value === "requires_action") {
		return __("Open your TWINT app and point your camera at the code")
	}
	return ""
})

const amountForDisplay = computed(() => {
	if (props.intent?.amount) return props.intent.amount
	if (isCreating.value && parsedAmount.value > 0) {
		return Math.round(parsedAmount.value * 100)
	}
	return null
})

const displayCurrency = computed(
	() => props.intent?.currency || props.currency || "CHF",
)

function formatMajor(amount, currency) {
	const formatter = new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency || "CHF",
	})
	return formatter.format(Number(amount) || 0)
}

function formatMinor(amount, currency) {
	return formatMajor(Number(amount) / 100, currency)
}

watch(status, (s) => {
	if (s === "succeeded") emit("succeeded")
	else if (s === "failed") emit("failed")
})

function __(s) {
	return typeof window !== "undefined" && window.__ ? window.__(s) : s
}
</script>

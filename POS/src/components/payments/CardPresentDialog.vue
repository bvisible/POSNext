<!--
  CardPresentDialog
  -----------------
  PSP-agnostic dialog for card-present terminal payments (Stripe Terminal,
  future Worldline/Saferpay/Adyen…). Replaces the legacy Wallee overlay.

  Lifecycle (driven by props.intent + props.inFlight):
    1. idle        → intent is null, inFlight is false. Cashier enters an
                     amount via numpad, optionally picks a terminal, then
                     clicks "Démarrer". Component emits `start({amount,
                     device})` for the parent to call pos_start_payment.
    2. creating    → inFlight is true. Brief spinner overlay while the parent
                     awaits the API response.
    3. processing  → intent.status is requires_action or processing. Cashier
                     prompts the customer to tap/insert the card on the
                     terminal. Status updates arrive via SocketIO and the
                     parent re-fetches the intent (usePaymentDriver).
    4. succeeded / failed / canceled → terminal state visuals.

  Props:
    - posProfile       (string)  POS Profile name — used to fetch active devices
    - modeOfPayment    (string)  Mode of Payment label (e.g. "Carte de crédit")
    - defaultAmount    (number)  Amount pre-filled in the numpad, in MAJOR units (e.g. 12.00 CHF)
    - currency         (string)  ISO code (e.g. "CHF"). Defaults to "CHF".
    - provider         (string)  Provider name from the mapping (e.g. "stripe_test")
    - channel          (string)  Channel code from the mapping (e.g. "terminal")
    - defaultDevice    (string)  Default Payment Device from the mapping (pre-selected)
    - intent           (object)  Live Payment Intent payload — null while idle
    - inFlight         (boolean) True while the parent's pos_start_payment is in flight
    - readerLabel      (string)  Optional label override for the terminal

  Emits:
    - start({amount, device})  user clicked "Démarrer" — amount in MAJOR units, device is the picked Payment Device name (or null)
    - cancel                   user clicked Cancel (idle: just close; processing: parent should call pos_cancel_payment then close)
    - close                    user dismissed the dialog (terminal state)
    - succeeded                bubbled when intent.status flips to "succeeded"
    - failed                   bubbled when intent.status flips to "failed"
-->
<template>
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
		<div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
			<header class="flex items-center justify-between px-5 py-4 border-b border-gray-200">
				<div>
					<h2 class="text-lg font-bold text-gray-900">{{ __('Card Payment') }}</h2>
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

			<!-- ============ IDLE STATE: amount entry + terminal selection ============ -->
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

				<!-- Terminal selector (only when > 1 device available) -->
				<div v-if="loadingDevices" class="mb-4 text-center text-sm text-gray-500">
					{{ __('Loading terminals…') }}
				</div>
				<div v-else-if="devicesError" class="mb-4 text-center text-sm text-red-600">
					{{ devicesError }}
				</div>
				<div v-else-if="availableDevices.length > 1" class="mb-4">
					<div class="text-xs uppercase tracking-wide text-gray-500 mb-2">
						{{ __('Terminal') }}
					</div>
					<!-- Card grid: 2 columns to gain vertical space; ≥3 devices wraps. -->
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
							<span
								v-if="dev.status === 'offline'"
								class="inline-block mt-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-700"
							>{{ __('offline') }}</span>
							<span
								v-else-if="dev.is_simulator"
								class="inline-block mt-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
							>{{ __('test') }}</span>
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
			<section v-else class="px-6 py-8 text-center">
				<div class="mx-auto mb-6 w-32 h-32 rounded-full flex items-center justify-center"
					:class="iconBgClass">
					<svg v-if="isCreating || isProcessing" class="w-16 h-16 text-blue-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<rect x="2" y="6" width="20" height="13" rx="2" stroke-width="1.5"/>
						<line x1="2" y1="10" x2="22" y2="10" stroke-width="1.5"/>
					</svg>
					<svg v-else-if="status === 'succeeded'" class="w-16 h-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
					</svg>
					<!-- //// Neoffice — a soft decline is a WAIT, not an end: the reader
					     re-prompts for the PIN and the same intent settles ~20 s later.
					     A pulsing amber clock keeps the cashier's hands off the card;
					     the red cross is reserved for `canceled`, which really is over. -->
					<svg v-else-if="status === 'failed'" class="w-16 h-16 text-amber-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<circle cx="12" cy="12" r="9" stroke-width="1.5"/>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 7v5l3 2"/>
					</svg>
					<svg v-else-if="status === 'canceled'" class="w-16 h-16 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</div>

				<p class="text-lg font-semibold text-gray-900 mb-2">{{ headline }}</p>
				<p v-if="subline" class="text-sm text-gray-500">{{ subline }}</p>

				<div v-if="amountForDisplay" class="mt-4 text-3xl font-bold text-gray-900">
					{{ formatMinor(amountForDisplay, displayCurrency) }}
				</div>

				<!-- Simulator controls — test mode + simulated reader only -->
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
						{{ __('No physical terminal will run. Pick an outcome to drive the simulated reader.') }}
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

			<!-- ============ FOOTER (state-driven actions) ============ -->
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
						{{ __('Start payment') }}
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
import { computed, onMounted, ref, watch } from "vue"
import { call } from "frappe-ui"

const props = defineProps({
	// Idle-state config
	posProfile: { type: String, default: "" },
	modeOfPayment: { type: String, default: "" },
	defaultAmount: { type: Number, default: 0 },
	currency: { type: String, default: "CHF" },
	provider: { type: String, default: "" },
	channel: { type: String, default: "" },
	defaultDevice: { type: String, default: null },
	readerLabel: { type: String, default: "" },
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

function formatForInput(n) {
	// Two-decimal string for the input field
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

// Quick-amount suggestions: default amount, then round-up steps.
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

// -------- Device list (idle) --------
const availableDevices = ref([])
const selectedDevice = ref(props.defaultDevice || null)
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
		// Pre-select: explicit defaultDevice, otherwise the row flagged is_default,
		// otherwise the first device.
		if (props.defaultDevice && availableDevices.value.some((d) => d.name === props.defaultDevice)) {
			selectedDevice.value = props.defaultDevice
		} else {
			const def = availableDevices.value.find((d) => d.is_default)
			selectedDevice.value = def?.name || availableDevices.value[0]?.name || null
		}
		if (!availableDevices.value.length) {
			devicesError.value = __(
				"No active terminal configured for this Mode of Payment on this POS Profile. Add one in POS Profile → Active Payment Methods & Terminals.",
			)
		}
	} catch (e) {
		devicesError.value = e?.message || __("Failed to load terminals")
		availableDevices.value = []
	} finally {
		loadingDevices.value = false
	}
}

const canStart = computed(
	() =>
		parsedAmount.value > 0 &&
		!loadingDevices.value &&
		!devicesError.value &&
		availableDevices.value.length > 0 &&
		!!selectedDevice.value,
)

onMounted(loadDevices)
watch(
	() => [props.posProfile, props.modeOfPayment, props.provider, props.channel],
	() => loadDevices(),
)

// Refresh the input default amount if it changes (e.g. parent splits the bill)
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
	emit("start", {
		amount: parsedAmount.value,
		device: selectedDevice.value,
	})
}

// -------- Simulator controls (test mode + simulated reader) --------
// Test-only convenience: drive the Stripe simulated reader from the POS UI
// to "Accept" or "Decline" the payment, so the full success/fail flow can
// be validated without configuring webhooks. The backend endpoint guards
// itself: only fires when provider.mode == "test" AND device is simulated.
const selectedDeviceInfo = computed(
	() => availableDevices.value.find((d) => d.name === selectedDevice.value) || null,
)
const showSimulatorControls = computed(
	() =>
		!!props.intent &&
		isProcessing.value &&
		!!selectedDeviceInfo.value?.is_simulator &&
		!!selectedDeviceInfo.value?.is_test_mode,
)
const simulatorBusy = ref(null) // null | "succeeded" | "declined" — also doubles as button label state
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
		// The backend transitions the FSM + publishes the SocketIO event.
		// The parent's usePaymentDriver refreshStatus will pick it up and
		// flip props.intent.status — the rest of the UI reacts automatically.
	} catch (e) {
		simulatorError.value = e?.message || __("Simulator call failed")
	} finally {
		simulatorBusy.value = null
	}
}

// -------- Terminal-state visuals --------
const headerSubtitle = computed(() => {
	if (isIdle.value) return props.modeOfPayment || __("Enter amount and start the payment")
	if (isCreating.value) return __("Creating payment…")
	const dev = availableDevices.value.find((d) => d.name === selectedDevice.value)
	return props.readerLabel || dev?.device_label || props.modeOfPayment || ""
})

const headline = computed(() => {
	if (isCreating.value) return __("Preparing the terminal…")
	switch (status.value) {
		case "requires_action":
			return __("Present card on reader")
		case "processing":
			return __("Processing payment…")
		case "succeeded":
			return __("Payment successful")
		case "failed":
			//// Neoffice — NOT "Payment failed". A card-present decline is usually
			//// soft: the reader re-prompts for the PIN and the same intent settles
			//// ~20 s later (measured at guigoz: 20 s and 19 s). A red "failed" for
			//// those 20 s is precisely what made the cashier re-run the card and
			//// charge the customer twice. Say what the cashier must DO: wait.
			return __("Declined — waiting for a new attempt")
		case "canceled":
			return __("Payment canceled")
		default:
			return status.value || ""
	}
})

const subline = computed(() => {
	if (isCreating.value) return __("Please wait a moment.")
	if (status.value === "failed") {
		//// Neoffice — a decline on a Stripe reader is usually a *soft* one (the
		//// reader simply asks for the PIN again) and the same intent can still
		//// settle. The till keeps listening, so the cashier must NOT re-run the
		//// card — doing so is what charged customers twice before this fix.
		const hint = __("The customer can try again on the terminal — do not re-run the card.")
		return props.intent?.error_message ? `${props.intent.error_message} — ${hint}` : hint
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
			//// Neoffice — amber, not red: the till is still listening and the
			//// payment can still go through. Red reads as "over, do something".
			return "bg-amber-100"
		case "canceled":
			return "bg-red-100"
		default:
			return "bg-blue-50"
	}
})

// Amount shown in the lower text (processing onwards).
// Prefer the intent's amount (server-confirmed). Fallback to parsedAmount in minor.
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

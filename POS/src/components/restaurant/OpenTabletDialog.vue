<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Opening a tablet as the kitchen's or the runner's screen -->
	<!-- //// (NeoRestau lot 1, task 16): the manager chooses the screen, the till shows a one-time QR code with the -->
	<!-- //// time it stays valid, the tablet scans it and opens with an account of its own, no password typed. Beside -->
	<!-- //// it, the restaurant's tablets, each with who paired it, when it was last seen, and « Disconnect ». The -->
	<!-- //// server decides who may do any of it (pos_next.api.restaurant_devices). -->
	<Dialog v-model="show" :options="{ title: __('Open a tablet'), size: '3xl' }">
		<template #body-content>
			<div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-test="open-tablet">
				<!-- The screen, then its code -->
				<section>
					<p class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ __("Screen") }}</p>
					<div class="mt-2 flex flex-wrap gap-2" data-test="screen-choices">
						<button
							v-for="choice in choices"
							:key="choice.key"
							type="button"
							class="min-h-[40px] rounded-[10px] border px-3 text-sm font-medium transition-colors"
							:class="chosen?.key === choice.key
								? 'border-[#D68A59] bg-[#FCF3EA] text-[#A15A2E]'
								: 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'"
							:data-test="`screen-${choice.key}`"
							@click="choose(choice)"
						>
							{{ choice.label }}
						</button>
					</div>

					<div class="mt-4 flex min-h-[232px] items-center gap-4 rounded-[14px] border border-gray-200 bg-[#FAF8F5] p-4" data-test="pairing">
						<p v-if="!chosen" class="w-full text-center text-sm text-gray-500">
							{{ __("Choose the screen this tablet opens.") }}
						</p>
						<div v-else-if="opened" class="w-full text-center" data-test="pairing-done">
							<div class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-700">
								<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
							</div>
							<p class="text-sm font-medium text-gray-900">{{ __("The tablet is open.") }}</p>
						</div>
						<template v-else-if="code">
							<div
								class="h-[200px] w-[200px] flex-shrink-0 rounded-[10px] bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
								:class="expired ? 'opacity-20' : ''"
								data-test="pairing-qr"
								v-html="code.svg"
							></div>
							<div class="min-w-0">
								<p class="text-sm text-gray-700">
									{{ __("Scan this code with the tablet's camera: its screen opens, with no password.") }}
								</p>
								<p v-if="!expired" class="mt-3 text-sm font-semibold text-[#A15A2E]" data-test="pairing-time-left">
									{{ __("Valid for {0}", [timeLeft]) }}
								</p>
								<template v-else>
									<p class="mt-3 text-sm font-semibold text-red-600" data-test="pairing-expired">
										{{ __("This code has expired.") }}
									</p>
									<button
										type="button"
										class="mt-3 min-h-[40px] rounded-[10px] bg-[#141414] px-4 text-sm font-medium text-white hover:bg-black"
										data-test="pairing-new-code"
										@click="choose(chosen)"
									>
										{{ __("New code") }}
									</button>
								</template>
							</div>
						</template>
						<p v-else class="w-full text-center text-sm text-gray-500">…</p>
					</div>
				</section>

				<!-- The restaurant's tablets -->
				<section>
					<p class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ __("Paired tablets") }}</p>
					<p v-if="!tablets.length" class="mt-3 text-sm text-gray-500" data-test="tablets-none">
						{{ __("No tablet is paired yet.") }}
					</p>
					<ul v-else class="mt-2 divide-y divide-gray-100" data-test="tablets">
						<li v-for="tablet in tablets" :key="tablet.name" class="py-2.5" :data-test="`tablet-${tablet.name}`">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-gray-900">{{ labelOf(tablet) }}</p>
									<p class="mt-0.5 text-xs text-gray-500">
										<span v-if="tablet.paired_by_name">{{ __("Paired by {0}", [tablet.paired_by_name]) }} · </span>
										<span>{{ tablet.last_seen ? __("Last seen: {0}", [seenAt(tablet.last_seen)]) : __("Not seen yet") }}</span>
									</p>
								</div>
								<span
									v-if="tablet.disconnected"
									class="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
								>
									{{ __("Disconnected") }}
								</span>
								<button
									v-else-if="confirming !== tablet.name"
									type="button"
									class="flex-shrink-0 min-h-[32px] rounded-[8px] border border-gray-200 px-2.5 text-xs font-medium text-red-600 hover:border-red-200 hover:bg-red-50"
									:data-test="`disconnect-${tablet.name}`"
									@click="confirming = tablet.name"
								>
									{{ __("Disconnect") }}
								</button>
							</div>
							<div v-if="confirming === tablet.name" class="mt-2 rounded-[10px] bg-red-50 p-2.5" :data-test="`confirm-${tablet.name}`">
								<p class="text-xs text-red-800">{{ __("Disconnect this tablet? It must scan a new code to open again.") }}</p>
								<div class="mt-2 flex justify-end gap-2">
									<button type="button" class="min-h-[32px] rounded-[8px] px-2.5 text-xs font-medium text-gray-700 hover:bg-white" @click="confirming = null">
										{{ __("Cancel") }}
									</button>
									<button
										type="button"
										class="min-h-[32px] rounded-[8px] bg-red-600 px-2.5 text-xs font-medium text-white hover:bg-red-700"
										:data-test="`disconnect-confirm-${tablet.name}`"
										@click="disconnect(tablet)"
									>
										{{ __("Disconnect") }}
									</button>
								</div>
							</div>
						</li>
					</ul>
				</section>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue"
import { Dialog } from "frappe-ui"
import QRCode from "qrcode"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import { formatDateTime, formatTime } from "@/utils/currency"

const API = "pos_next.api.restaurant_devices"
// While a code is shown, the till looks every few seconds whether its tablet has opened
const WATCH_EVERY = 4000

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	// The restaurant of the till (none: the server takes the till's own)
	restaurant: { type: String, default: undefined },
})
const emit = defineEmits(["update:modelValue"])
const show = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
})

const { showError } = useToast()
const stations = ref([])
const tablets = ref([])
const chosen = ref(null)
// The code on screen: { svg, screen, station }
const code = ref(null)
const secondsLeft = ref(0)
const opened = ref(false)
const confirming = ref(null)
let countdown = null
let watcher = null
// When each tablet of the chosen screen was paired, as the list said when the code was made
let pairedBefore = null

const ofTheRestaurant = () => (props.restaurant ? { restaurant: props.restaurant } : {})

const choices = computed(() => [
	{ key: "kitchen", screen: "Kitchen", station: null, label: __("Kitchen, all stations") },
	...stations.value.map((station) => ({
		key: `kitchen-${station.name}`,
		screen: "Kitchen",
		station: station.name,
		label: __("Kitchen — {0}", [station.station_name]),
	})),
	{ key: "runner", screen: "Runner", station: null, label: __("Runner") },
])

const expired = computed(() => Boolean(code.value) && secondsLeft.value <= 0)
const timeLeft = computed(() => {
	const seconds = Math.max(0, secondsLeft.value)
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
})

/** A tablet is named by its screen and its station, in the language of the till. */
function labelOf(tablet) {
	if (tablet.screen === "Runner") return __("Runner")
	return tablet.station ? __("Kitchen — {0}", [tablet.station_name || tablet.station]) : __("Kitchen, all stations")
}

/** Today's visits by their time, older ones by their date and time. */
function seenAt(value) {
	const seen = new Date(String(value).replace(" ", "T"))
	return seen.toDateString() === new Date().toDateString() ? formatTime(value) : formatDateTime(value)
}

function sameScreen(tablet, choice) {
	return tablet.screen === choice.screen && (tablet.station || null) === (choice.station || null)
}

function stopTimers() {
	clearInterval(countdown)
	clearInterval(watcher)
	countdown = null
	watcher = null
}

async function loadTablets() {
	try {
		tablets.value = (await call(`${API}.get_devices`, ofTheRestaurant())) || []
	} catch (error) {
		console.error("Failed to load the tablets:", error)
		showError(__("Could not load the tablets."))
	}
}

async function loadStations() {
	try {
		stations.value = (await call("pos_next.api.restaurant.get_preparation_stations", ofTheRestaurant())) || []
	} catch (error) {
		console.error("Failed to load the stations:", error)
	}
}

/** A new code for the screen chosen, shown as a QR code with the time it stays valid. */
async function choose(choice) {
	stopTimers()
	chosen.value = choice
	code.value = null
	opened.value = false
	pairedBefore = Object.fromEntries(
		tablets.value.filter((tablet) => sameScreen(tablet, choice)).map((tablet) => [tablet.name, tablet.paired_at]),
	)
	try {
		const made = await call(`${API}.create_pairing_code`, {
			screen: choice.screen,
			station: choice.station,
			...ofTheRestaurant(),
		})
		const svg = await QRCode.toString(made.url, {
			type: "svg",
			margin: 1,
			errorCorrectionLevel: "M",
			color: { dark: "#141414", light: "#FFFFFF" },
		})
		code.value = { svg, screen: choice.screen, station: choice.station }
		secondsLeft.value = made.expires_in
		countdown = setInterval(() => {
			secondsLeft.value -= 1
			if (secondsLeft.value <= 0) stopTimers()
		}, 1000)
		watcher = setInterval(watchTheTablet, WATCH_EVERY)
	} catch (error) {
		console.error("Failed to create a pairing code:", error)
		showError(__("Could not create a code."))
	}
}

/** The tablet of the chosen screen has opened when the list shows it paired since the code was made. */
async function watchTheTablet() {
	await loadTablets()
	const choice = chosen.value
	if (!choice || !code.value) return
	const paired = tablets.value.some(
		(tablet) => sameScreen(tablet, choice) && !tablet.disconnected && tablet.paired_at !== pairedBefore?.[tablet.name],
	)
	if (paired) {
		stopTimers()
		code.value = null
		opened.value = true
	}
}

async function disconnect(tablet) {
	confirming.value = null
	try {
		await call(`${API}.disconnect_device`, { device: tablet.name })
	} catch (error) {
		console.error("Failed to disconnect the tablet:", error)
		showError(__("Could not disconnect the tablet."))
	}
	await loadTablets()
}

onMounted(() => {
	loadStations()
	loadTablets()
})
onUnmounted(stopTimers)
</script>

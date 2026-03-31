<template>
	<div class="flex flex-col min-h-screen bg-gray-50">
		<!-- Header -->
		<div class="bg-white border-b px-4 py-4 text-center">
			<img
				v-if="companyLogo"
				:src="companyLogo"
				class="h-10 mx-auto mb-2"
				alt=""
			/>
			<h1 class="text-xl font-bold text-gray-900">{{ __("Book a Table") }}</h1>
			<p class="text-sm text-gray-500 mt-1">{{ __("Reserve your table online") }}</p>
		</div>

		<!-- Loading -->
		<div v-if="isLoading" class="flex-1 flex items-center justify-center">
			<svg class="w-8 h-8 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
				<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
			</svg>
		</div>

		<!-- Disabled -->
		<div v-else-if="!enabled" class="flex-1 flex items-center justify-center p-8 text-center">
			<div>
				<div class="w-16 h-16 rounded-full bg-gray-100 mx-auto mb-4 flex items-center justify-center">
					<svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
					</svg>
				</div>
				<h2 class="text-lg font-bold text-gray-900 mb-1">{{ __("Online reservations are not available") }}</h2>
				<p class="text-sm text-gray-500">{{ __("Please call us to make a reservation") }}</p>
			</div>
		</div>

		<!-- Success -->
		<div v-else-if="submitted" class="flex-1 flex items-center justify-center p-8 text-center">
			<div class="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full">
				<div class="w-16 h-16 rounded-full bg-green-100 mx-auto mb-4 flex items-center justify-center">
					<svg class="w-9 h-9 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
					</svg>
				</div>
				<h2 class="text-lg font-bold text-gray-900 mb-2">{{ __("Reservation Submitted!") }}</h2>
				<p class="text-sm text-gray-600">{{ __("Please check your email to confirm the reservation.") }}</p>
				<p class="text-xs text-gray-400 mt-4">{{ __("Check your spam folder if you don't see the email.") }}</p>
			</div>
		</div>

		<!-- Form -->
		<div v-else class="flex-1 overflow-y-auto p-4 pb-24">
			<div class="max-w-lg mx-auto bg-white rounded-xl shadow-sm p-6 space-y-4">
				<!-- Date -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Date") }} *</label>
					<input
						v-model="form.reservation_date"
						type="date"
						:min="today"
						class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
						required
					/>
				</div>

				<!-- Time slot -->
				<div v-if="slots.length > 0">
					<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Time") }} *</label>
					<div class="grid grid-cols-3 gap-2">
						<button
							v-for="slot in timeOptions"
							:key="slot"
							class="px-3 py-2 text-sm rounded-lg border transition-colors"
							:class="form.reservation_time === slot
								? 'bg-blue-600 text-white border-blue-600'
								: 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'"
							@click="form.reservation_time = slot"
						>
							{{ slot }}
						</button>
					</div>
				</div>
				<div v-else-if="form.reservation_date" class="text-sm text-gray-500 italic">
					{{ __("No available slots for this date") }}
				</div>

				<!-- Guests -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Number of Guests") }} *</label>
					<div class="flex gap-2">
						<button
							v-for="n in [1, 2, 3, 4, 5, 6, 7, 8]"
							:key="n"
							class="w-10 h-10 rounded-lg border text-sm font-medium transition-colors"
							:class="form.no_of_guests === n
								? 'bg-blue-600 text-white border-blue-600'
								: 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'"
							@click="form.no_of_guests = n"
						>
							{{ n }}
						</button>
						<input
							v-if="form.no_of_guests > 8"
							v-model.number="form.no_of_guests"
							type="number"
							min="1"
							class="w-16 px-2 py-1 border border-gray-300 rounded-lg text-center"
						/>
						<button
							class="w-10 h-10 rounded-lg border border-gray-300 text-gray-500 hover:border-blue-400"
							@click="form.no_of_guests = form.no_of_guests > 8 ? form.no_of_guests + 1 : 9"
						>
							+
						</button>
					</div>
				</div>

				<!-- Tables (optional for guest — they can let the restaurant choose) -->
				<div v-if="availableTables.length > 0">
					<label class="block text-sm font-medium text-gray-700 mb-1">
						{{ __("Preferred Table") }}
						<span class="text-xs text-gray-400">({{ __("optional") }})</span>
					</label>
					<div class="flex flex-wrap gap-2">
						<button
							v-for="table in availableTables"
							:key="table.name"
							class="px-3 py-1.5 text-sm rounded-lg border transition-colors"
							:class="[
								selectedTables.includes(table.name)
									? 'bg-blue-100 border-blue-500 text-blue-700'
									: table.available
										? 'bg-white border-gray-300 text-gray-700 hover:border-blue-400'
										: 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
							]"
							:disabled="!table.available"
							@click="toggleTable(table)"
						>
							{{ table.table_name }} ({{ table.capacity }}p)
						</button>
					</div>
				</div>

				<!-- Contact info -->
				<div class="grid grid-cols-1 gap-4 pt-2 border-t border-gray-100">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Your Name") }} *</label>
						<input
							v-model="form.guest_name"
							type="text"
							class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Phone") }} *</label>
						<input
							v-model="form.phone"
							type="tel"
							class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base"
							required
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ __("Email") }} *</label>
						<input
							v-model="form.email"
							type="email"
							class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base"
							required
						/>
					</div>
				</div>

				<!-- Notes -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">
						{{ __("Special Requests") }}
						<span class="text-xs text-gray-400">({{ __("optional") }})</span>
					</label>
					<textarea
						v-model="form.notes"
						rows="2"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg text-base resize-none"
						:placeholder="__('Allergies, birthday, high chair...')"
					/>
				</div>
			</div>
		</div>

		<!-- Fixed submit button -->
		<div v-if="!submitted && enabled && !isLoading" class="fixed bottom-0 left-0 right-0 bg-white border-t p-4 safe-area-bottom">
			<button
				class="w-full py-3.5 rounded-xl font-semibold text-base transition-colors"
				:class="isFormValid
					? 'bg-blue-600 text-white active:bg-blue-700'
					: 'bg-gray-200 text-gray-400 cursor-not-allowed'"
				:disabled="!isFormValid || submitting"
				@click="submitReservation"
			>
				{{ submitting ? __("Submitting...") : __("Book Now") }}
			</button>
		</div>

		<!-- Error toast -->
		<div
			v-if="errorMessage"
			class="fixed top-4 left-4 right-4 bg-red-600 text-white px-4 py-3 rounded-xl text-sm font-medium shadow-lg z-50"
			@click="errorMessage = ''"
		>
			{{ errorMessage }}
		</div>
	</div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from "vue"

const isLoading = ref(true)
const enabled = ref(false)
const submitted = ref(false)
const submitting = ref(false)
const errorMessage = ref("")
const companyLogo = ref("")
const slots = ref([])
const availableTables = ref([])
const selectedTables = ref([])

const today = new Date().toISOString().slice(0, 10)

const form = reactive({
	reservation_date: today,
	reservation_time: "",
	no_of_guests: 2,
	guest_name: "",
	phone: "",
	email: "",
	notes: "",
})

const timeOptions = computed(() => {
	// Generate 30-minute intervals from available slots
	const options = []
	for (const slot of slots.value) {
		const [fromH, fromM] = slot.from_time.split(":").map(Number)
		const [toH, toM] = slot.to_time.split(":").map(Number)
		let h = fromH
		let m = fromM
		while (h < toH || (h === toH && m <= toM)) {
			options.push(
				`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
			)
			m += 30
			if (m >= 60) {
				m = 0
				h++
			}
		}
	}
	return options
})

const isFormValid = computed(() => {
	return (
		form.reservation_date &&
		form.reservation_time &&
		form.no_of_guests > 0 &&
		form.guest_name?.trim() &&
		form.phone?.trim() &&
		form.email?.trim()
	)
})

function toggleTable(table) {
	if (!table.available) return
	const idx = selectedTables.value.indexOf(table.name)
	if (idx >= 0) {
		selectedTables.value.splice(idx, 1)
	} else {
		selectedTables.value.push(table.name)
	}
}

async function fetchSlots() {
	if (!form.reservation_date) return
	try {
		const response = await fetch(
			`/api/method/pos_next.api.reservations.get_available_slots?date=${form.reservation_date}`,
			{
				headers: {
					"X-Frappe-CSRF-Token": window.csrf_token || "",
				},
			},
		)
		const data = await response.json()
		slots.value = data.message?.slots || []
	} catch {
		slots.value = []
	}
}

async function fetchTables() {
	if (!form.reservation_date || !form.reservation_time) return
	try {
		const params = new URLSearchParams({
			date: form.reservation_date,
			time: `${form.reservation_time}:00`,
			no_of_guests: form.no_of_guests,
		})
		const response = await fetch(
			`/api/method/pos_next.api.reservations.get_available_tables?${params}`,
			{
				headers: {
					"X-Frappe-CSRF-Token": window.csrf_token || "",
				},
			},
		)
		const data = await response.json()
		availableTables.value = data.message?.tables || []
	} catch {
		availableTables.value = []
	}
}

async function submitReservation() {
	if (!isFormValid.value || submitting.value) return
	submitting.value = true
	errorMessage.value = ""

	try {
		const response = await fetch(
			"/api/method/pos_next.api.reservations.submit_guest_reservation",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Frappe-CSRF-Token": window.csrf_token || "",
				},
				body: JSON.stringify({
					reservation_date: form.reservation_date,
					reservation_time: `${form.reservation_time}:00`,
					no_of_guests: form.no_of_guests,
					guest_name: form.guest_name,
					phone: form.phone,
					email: form.email,
					tables: JSON.stringify(selectedTables.value),
					notes: form.notes,
				}),
			},
		)

		const data = await response.json()

		if (data.exc) {
			const errMsg = data._server_messages
				? JSON.parse(data._server_messages)?.[0]
				: null
			errorMessage.value = errMsg
				? JSON.parse(errMsg)?.message || __("An error occurred")
				: __("An error occurred")
			return
		}

		submitted.value = true
	} catch {
		errorMessage.value = __("Network error. Please try again.")
	} finally {
		submitting.value = false
	}
}

async function checkEnabled() {
	try {
		// Quick check if online reservations are enabled
		const response = await fetch(
			`/api/method/pos_next.api.reservations.get_available_slots?date=${today}`,
			{
				headers: {
					"X-Frappe-CSRF-Token": window.csrf_token || "",
				},
			},
		)
		const data = await response.json()
		// If we get a successful response, it means reservations are enabled
		if (!data.exc) {
			enabled.value = true
		}
	} catch {
		enabled.value = false
	}
}

// Fetch company logo
async function fetchLogo() {
	try {
		const response = await fetch(
			`/api/method/frappe.client.get_list?${new URLSearchParams({
				doctype: "Company",
				fields: '["company_logo"]',
				limit_page_length: "1",
			})}`,
		)
		const data = await response.json()
		if (data.message?.[0]?.company_logo) {
			companyLogo.value = data.message[0].company_logo
		}
	} catch {
		// No logo
	}
}

watch(
	() => form.reservation_date,
	() => {
		form.reservation_time = ""
		selectedTables.value = []
		fetchSlots()
	},
)

watch(
	() => [form.reservation_time, form.no_of_guests],
	() => {
		selectedTables.value = []
		if (form.reservation_time) {
			fetchTables()
		}
	},
)

onMounted(async () => {
	await Promise.all([checkEnabled(), fetchLogo()])
	if (enabled.value) {
		await fetchSlots()
	}
	isLoading.value = false
})
</script>

<style scoped>
.safe-area-bottom {
	padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
</style>

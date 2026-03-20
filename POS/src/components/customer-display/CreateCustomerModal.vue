<template>
	<div class="bg-white flex flex-col">
		<!-- Header -->
		<div class="flex items-center justify-between px-5 py-3 border-b border-gray-200">
			<h2 class="text-base font-semibold text-gray-900 flex items-center gap-2">
				<FeatherIcon name="user-plus" class="w-5 h-5 text-blue-600" />
				{{ __("Create Account") }}
			</h2>
			<button
				class="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-neo-sm transition-colors"
				@click="$emit('close')"
			>
				<FeatherIcon name="x" class="w-5 h-5" />
			</button>
		</div>

		<!-- Form -->
		<form class="px-5 py-4 space-y-3" @submit.prevent="handleSubmit">
			<!-- Error message -->
			<div v-if="error" class="p-3 bg-red-50 border border-red-200 rounded-neo-sm">
				<p class="text-red-700 text-sm">{{ error }}</p>
			</div>

			<!-- First Name and Last Name -->
			<div class="grid grid-cols-2 gap-2">
				<input
					v-model="form.first_name"
					type="text"
					required
					:placeholder="__('First name') + ' *'"
					class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
					:disabled="isSubmitting"
				/>
				<input
					v-model="form.last_name"
					type="text"
					required
					:placeholder="__('Last name') + ' *'"
					class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
					:disabled="isSubmitting"
				/>
			</div>

			<!-- Email -->
			<input
				v-model="form.email"
				type="email"
				required
				:placeholder="__('Email') + ' *'"
				class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
				:disabled="isSubmitting"
			/>

			<!-- Mobile Number with Country Code Selector -->
			<div class="flex gap-2">
				<!-- Country Code Dropdown -->
				<div class="relative" ref="dropdownRef">
					<button
						type="button"
						@click="showCountryDropdown = !showCountryDropdown"
						class="flex items-center gap-1 w-24 ps-2 pe-1 py-2.5 border border-gray-200 rounded-neo-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 hover:bg-gray-100 text-gray-900"
						:disabled="isSubmitting"
					>
						<img
							:src="`https://flagcdn.com/h24/${currentCountryCode}.png`"
							:alt="currentCountryCode"
							class="w-6 h-auto rounded-sm"
							@error="handleFlagError"
						/>
						<span class="flex-1 text-start">{{ selectedCountryCode || "+33" }}</span>
						<svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					</button>

					<!-- Country Search Dropdown -->
					<div
						v-if="showCountryDropdown"
						class="absolute start-0 z-50 mt-1 w-72 max-h-64 bg-white rounded-neo-md shadow-neo-lg border border-gray-200 overflow-hidden"
					>
						<div class="sticky top-0 bg-white border-b border-gray-200 p-2">
							<input
								ref="countrySearchRef"
								v-model="countrySearchQuery"
								type="text"
								:placeholder="__('Search country...')"
								class="w-full px-3 py-2 text-sm border border-gray-200 rounded-neo-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
								@keydown.escape="showCountryDropdown = false"
							/>
						</div>
						<div class="overflow-y-auto max-h-48">
							<button
								v-for="country in filteredCountries"
								:key="country.code"
								type="button"
								@click="selectCountry(country)"
								class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-start"
								:class="{ 'bg-blue-50': selectedCountryCode === country.isd }"
							>
								<img
									:src="`https://flagcdn.com/h24/${country.code.toLowerCase()}.png`"
									:alt="country.name"
									class="w-5 h-auto rounded-sm shadow-sm"
									@error="(e) => (e.target.style.display = 'none')"
								/>
								<span class="flex-1 text-sm text-gray-700 truncate">{{ country.name }}</span>
								<span class="text-sm text-gray-400">{{ country.isd }}</span>
							</button>
							<div v-if="filteredCountries.length === 0" class="px-4 py-6 text-center text-sm text-gray-400">
								{{ __("No countries found") }}
							</div>
						</div>
					</div>
				</div>

				<!-- Phone Number Input -->
				<input
					v-model="phoneNumber"
					type="tel"
					required
					:placeholder="__('Phone number') + ' *'"
					class="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-start"
					:disabled="isSubmitting"
					@input="updateMobileNumber"
				/>
			</div>

			<!-- Address fields (conditional) -->
			<template v-if="showAddress">
				<input
					v-model="form.address_line1"
					type="text"
					:placeholder="__('Street address')"
					class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
					:disabled="isSubmitting"
				/>
				<div class="grid grid-cols-2 gap-2">
					<input
						v-model="form.city"
						type="text"
						:placeholder="__('City')"
						class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						:disabled="isSubmitting"
					/>
					<input
						v-model="form.pincode"
						type="text"
						:placeholder="__('Postal code')"
						class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						:disabled="isSubmitting"
					/>
				</div>
				<input
					v-model="form.country"
					type="text"
					:placeholder="__('Country')"
					class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
					:disabled="isSubmitting"
				/>
			</template>
		</form>

		<!-- Footer -->
		<div class="px-5 pb-4 flex gap-2">
			<button
				type="button"
				:disabled="isSubmitting"
				class="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-neo-md text-sm font-semibold text-gray-700 transition-colors"
				@click="$emit('close')"
			>
				{{ __("Cancel") }}
			</button>
			<button
				:disabled="isSubmitting || !form.first_name || !form.last_name || !form.email || !phoneNumber"
				class="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-neo-md text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
				@click="handleSubmit"
			>
				<FeatherIcon
					v-if="isSubmitting"
					name="loader"
					class="w-4 h-4 animate-spin"
				/>
				<span>{{ isSubmitting ? __("Submitting...") : __("Submit") }}</span>
			</button>
		</div>
	</div>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
import {
	reactive,
	ref,
	computed,
	onMounted,
	onBeforeUnmount,
	nextTick,
	watch,
} from "vue"
import { useCustomerDisplayStore } from "@/stores/customerDisplay"
import { useCountriesStore } from "@/stores/countries"

const props = defineProps({
	showAddress: {
		type: Boolean,
		default: true,
	},
})

const emit = defineEmits(["close", "created"])

const displayStore = useCustomerDisplayStore()
const countriesStore = useCountriesStore()

// Get default country from session (company country)
const defaultCountry = displayStore.sessionInfo?.country || ""

const form = reactive({
	first_name: "",
	last_name: "",
	email: "",
	mobile_no: "",
	// Address fields
	address_line1: "",
	city: "",
	pincode: "",
	country: defaultCountry,
})

// Phone number with country code
const selectedCountryCode = ref("")
const phoneNumber = ref("")
const showCountryDropdown = ref(false)
const countrySearchQuery = ref("")
const dropdownRef = ref(null)
const countrySearchRef = ref(null)

const isSubmitting = ref(false)
const error = ref(null)

// Computed for country code display
const currentCountryCode = computed(() => {
	const country = countriesStore.countries.find(
		(c) => c.isd === selectedCountryCode.value,
	)
	return country?.code.toLowerCase() || "fr"
})

const filteredCountries = computed(() => {
	if (!countrySearchQuery.value) return countriesStore.countries

	const query = countrySearchQuery.value.toLowerCase()
	return countriesStore.countries.filter(
		(c) =>
			c.name.toLowerCase().includes(query) ||
			c.isd.includes(query) ||
			c.code.toLowerCase().includes(query),
	)
})

// Set country code from country name
function setCountryFromName(countryName) {
	if (!countryName) {
		selectedCountryCode.value = "+33"
		return
	}

	const isd = countriesStore.countryNameToISDMap[countryName]
	if (isd) {
		selectedCountryCode.value = isd
	} else {
		selectedCountryCode.value = "+33"
	}
}

// Country dropdown handlers
function handleFlagError(e) {
	e.target.style.display = "none"
}

function selectCountry(country) {
	selectedCountryCode.value = country.isd
	showCountryDropdown.value = false
	countrySearchQuery.value = ""
	updateMobileNumber()
}

function updateMobileNumber() {
	form.mobile_no = phoneNumber.value
		? `${selectedCountryCode.value}-${phoneNumber.value}`
		: ""
}

function handleClickOutside(event) {
	if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
		showCountryDropdown.value = false
		countrySearchQuery.value = ""
	}
}

// Watch for dropdown open to focus search
watch(showCountryDropdown, async (isOpen) => {
	if (isOpen) {
		await nextTick()
		countrySearchRef.value?.focus()
	}
})

// Load countries on mount
onMounted(async () => {
	await countriesStore.loadCountries()
	// Set default country code from company country
	if (defaultCountry) {
		setCountryFromName(defaultCountry)
	}
	document.addEventListener("click", handleClickOutside)
})

onBeforeUnmount(() => {
	document.removeEventListener("click", handleClickOutside)
})

async function handleSubmit() {
	if (!form.first_name || !form.last_name || !form.email || !phoneNumber.value) return

	isSubmitting.value = true
	error.value = null

	try {
		const customerData = {
			customer_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
			email: form.email.trim() || null,
			mobile_no: form.mobile_no.trim() || null,
		}

		// Add address fields if provided
		if (props.showAddress) {
			if (form.address_line1.trim())
				customerData.address_line1 = form.address_line1.trim()
			if (form.city.trim()) customerData.city = form.city.trim()
			if (form.pincode.trim()) customerData.pincode = form.pincode.trim()
			if (form.country.trim()) customerData.country = form.country.trim()
		}

		const customer = await displayStore.createCustomer(customerData)

		// Reset form (keep default country and country code)
		form.first_name = ""
		form.last_name = ""
		form.email = ""
		form.mobile_no = ""
		form.address_line1 = ""
		form.city = ""
		form.pincode = ""
		form.country = defaultCountry
		phoneNumber.value = ""

		// Emit created event
		emit("created", customer)
	} catch (err) {
		error.value = err.message || __("An error occurred. Please try again.")
	} finally {
		isSubmitting.value = false
	}
}
</script>

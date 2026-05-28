<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// customer form - toggle Individual/Company, required fields, default S… — 4b36d7b + 616d410 (+6 more)
  //// simplify customer creation form — 616d410 + 8bffb77 (+3 more)
  //// add country code selector with flags for customer phone numbers — 34469c3
  //// add address fields to customer creation form — 8bffb77 + 458d81a (+5 more)
  //// Implement Bootstrap Store for optimized initial data loading — 4bb76f2
  //// add Swiss address autocomplete to customer creation forms — 6ed1256
  //// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a + 731374c
  //// add company name field and default to Switzerland — 731374c + 4b36d7b (+2 more)
  //// preselect country from company in customer creation forms — 71619d1
  //// linter formatting — 3e25c3b + 458d81a (+1 more)
  //// Implement offline capabilities for POS Next — 541c6f1
-->
<template>
	<Dialog v-model="show" :options="{ title: isEditMode ? __('Edit Customer') : __('Create New Customer'), size: 'md' }">
		<template #body-content>
			<div class="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
				<!-- Customer Type Toggle -->
				<div class="flex bg-gray-100 rounded-neo-sm p-0.5">
					<button
						type="button"
						@click="customerType = 'Individual'"
						class="flex-1 py-1.5 px-3 text-sm font-medium rounded-neo-sm transition-colors"
						:class="customerType === 'Individual'
							? 'bg-white text-gray-900 shadow-sm'
							: 'text-gray-500 hover:text-gray-700'"
					>
						{{ __("Individual") }}
					</button>
					<button
						type="button"
						@click="customerType = 'Company'"
						class="flex-1 py-1.5 px-3 text-sm font-medium rounded-neo-sm transition-colors"
						:class="customerType === 'Company'
							? 'bg-white text-gray-900 shadow-sm'
							: 'text-gray-500 hover:text-gray-700'"
					>
						{{ __("Company") }}
					</button>
				</div>

				<!-- Company Name (only when Company type) -->
				<input
					v-if="customerType === 'Company'"
					v-model="customerData.company_name"
					type="text"
					:placeholder="__('Company name') + ' *'"
					class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
				/>

				<!-- First Name + Last Name -->
				<div class="grid grid-cols-2 gap-2">
					<input
						v-model="customerData.first_name"
						type="text"
						:placeholder="__('First name') + ' *'"
						class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
					/>
					<input
						v-model="customerData.last_name"
						type="text"
						:placeholder="__('Last name') + ' *'"
						class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
					/>
				</div>

				<!-- Mobile Number with Country Code Selector -->
				<div class="flex gap-2">
					<!-- Country Code Dropdown -->
					<div class="relative" ref="dropdownRef">
						<button
							type="button"
							@click="showCountryDropdown = !showCountryDropdown"
							class="flex items-center gap-1 w-24 ps-2 pe-1 py-2.5 border border-gray-200 rounded-neo-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 hover:bg-gray-100"
						>
							<img
								:src="`https://flagcdn.com/h24/${currentCountryCode}.png`"
								:alt="currentCountryCode"
								class="w-6 h-auto rounded-sm"
								@error="handleFlagError"
							/>
							<span class="flex-1 text-start">{{ selectedCountryCode || "+41" }}</span>
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
						:placeholder="__('Phone number') + ' *'"
						class="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-start"
						@input="updateMobileNumber"
					/>
				</div>

				<!-- Email -->
				<input
					v-model="customerData.email_id"
					type="email"
					:placeholder="__('Email') + ' *'"
					class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
				/>

				<!-- Customer Group -->
				<select
					v-model="customerGroup"
					class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
				>
					<option value="" disabled>{{ __("Customer Group") }}</option>
					<option v-for="group in customerGroups" :key="group" :value="group">
						{{ group }}
					</option>
				</select>

				<!-- Address Fields (conditional) -->
				<template v-if="showAddressFields">
					<div class="pt-2 border-t border-gray-200">
						<p class="text-xs font-medium text-gray-500 mb-1">{{ __("Address") }}</p>
					</div>

					<AddressAutocomplete
						v-model="customerData.address_line1"
						:placeholder="__('Street address')"
						input-class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						@address-selected="onAddressSelected"
					/>

					<div class="grid grid-cols-2 gap-2">
						<input
							v-model="customerData.city"
							type="text"
							:placeholder="__('City')"
							class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						/>
						<input
							v-model="customerData.pincode"
							type="text"
							:placeholder="__('Postal code')"
							class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						/>
					</div>

					<select
						v-model="customerData.country"
						class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
					>
						<option value="">{{ __("Country") }}</option>
						<option v-for="country in countriesStore.countries" :key="country.code" :value="country.name">
							{{ country.name }}
						</option>
					</select>
				</template>
			</div>
		</template>

		<template #actions>
			<div class="flex flex-col gap-2">
				<!-- Permission Warning -->
				<div v-if="!hasPermission" class="px-3 py-2 bg-amber-50 border border-amber-200 rounded-neo-sm">
					<div class="flex items-start gap-2">
						<svg class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
								clip-rule="evenodd"
							/>
						</svg>
						<div class="flex-1">
							<p class="text-sm font-medium text-amber-900">{{ __("Permission Required") }}</p>
							<p class="text-xs text-amber-700 mt-0.5">
								{{ __("You don't have permission to create customers. Contact your administrator.") }}
							</p>
						</div>
					</div>
				</div>

				<div class="flex gap-2">
					<Button
						variant="solid"
						@click="handleCreate"
						:loading="createCustomerResource.loading || updateCustomerResource.loading || checkingPermission"
						:disabled="!isFormValid || !hasPermission"
					>
						{{ isEditMode ? __("Save Changes") : __("Create Customer") }}
					</Button>
					<Button variant="subtle" @click="show = false">
						{{ __("Cancel") }}
					</Button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
/**
 * CreateCustomerDialog - Quick customer creation from POS
 *
 * Features:
 * - Toggle between Individual and Company customer types
 * - Compact placeholder-only form (no labels)
 * - First/Last name split for structured input
 * - Country code selector with flag icons and search
 * - Auto-sets territory based on selected country
 * - Permission checking before allowing creation
 */

import AddressAutocomplete from "@/components/common/AddressAutocomplete.vue"
import { usePOSPermissions } from "@/composables/usePermissions"
import { useToast } from "@/composables/useToast"
import { useCountriesStore } from "@/stores/countries"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { usePOSShiftStore } from "@/stores/posShift"
import { logger } from "@/utils/logger"
import { Button, Dialog, createResource } from "frappe-ui"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

const log = logger.create("CreateCustomerDialog")

// =============================================================================
// Composables & Stores
// =============================================================================

const countriesStore = useCountriesStore()
const posSettingsStore = usePOSSettingsStore()
const posShiftStore = usePOSShiftStore()
const { canCreateCustomer } = usePOSPermissions()
const { showSuccess, showError } = useToast()

// =============================================================================
// Props & Emits
// =============================================================================

const props = defineProps({
	modelValue: Boolean,
	posProfile: String,
	initialName: String,
	customer: Object, // Customer object for edit mode
})

const emit = defineEmits([
	"update:modelValue",
	"customer-created",
	"customer-updated",
])

// =============================================================================
// State
// =============================================================================

const hasPermission = ref(true)
const checkingPermission = ref(false)
const selectedCountryCode = ref("+41")
const phoneNumber = ref("")
const showCountryDropdown = ref(false)
const countrySearchQuery = ref("")
const dropdownRef = ref(null)
const countrySearchRef = ref(null)

// Customer type toggle
const customerType = ref("Individual")

// Internal state
const customerGroup = ref("")
const defaultCustomerGroup = ref("Individual")
const territory = ref("All Territories")
const territories = ref(["All Territories"])
const customerGroups = ref([])

const customerData = ref({
	company_name: "",
	first_name: "",
	last_name: "",
	mobile_no: "",
	email_id: "",
	// Address fields
	address_line1: "",
	city: "",
	pincode: "",
	country: "",
})

// =============================================================================
// Computed
// =============================================================================

const show = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
})

const isEditMode = computed(() => !!props.customer?.name)

const isCompany = computed(() => customerType.value === "Company")

const fullName = computed(() => {
	if (isCompany.value && customerData.value.company_name.trim()) {
		return customerData.value.company_name.trim()
	}
	const first = customerData.value.first_name.trim()
	const last = customerData.value.last_name.trim()
	return last ? `${first} ${last}` : first
})

const isFormValid = computed(() => {
	if (isCompany.value) {
		return !!customerData.value.company_name.trim()
	}
	return !!(
		customerData.value.first_name.trim() &&
		customerData.value.last_name.trim() &&
		phoneNumber.value.trim() &&
		customerData.value.email_id.trim()
	)
})

const showAddressFields = computed(
	() => posSettingsStore.showAddressFieldsInCustomerForm,
)

function onAddressSelected(address) {
	log.info("Address selected", address)
	customerData.value.address_line1 = address.address_line1 || ""
	customerData.value.city = address.city || ""
	customerData.value.pincode = address.pincode || ""
	if (address.country) {
		customerData.value.country = address.country
	}
}

const currentCountryCode = computed(() => {
	const country = countriesStore.countries.find(
		(c) => c.isd === selectedCountryCode.value,
	)
	return country?.code.toLowerCase() || "ch"
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

// =============================================================================
// Country & Territory Methods
// =============================================================================

const handleFlagError = (e) => (e.target.style.display = "none")

const selectCountry = (country) => {
	selectedCountryCode.value = country.isd
	showCountryDropdown.value = false
	countrySearchQuery.value = ""
	updateMobileNumber()
}

const updateMobileNumber = () => {
	customerData.value.mobile_no = phoneNumber.value
		? `${selectedCountryCode.value}-${phoneNumber.value}`
		: ""
}

const handleClickOutside = (event) => {
	if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
		showCountryDropdown.value = false
		countrySearchQuery.value = ""
	}
}

const setCountryFromName = (countryName) => {
	if (!countryName) {
		selectedCountryCode.value = "+41"
		return
	}

	const isd = countriesStore.countryNameToISDMap[countryName]
	if (isd) {
		selectedCountryCode.value = isd
		// Also preselect country in address field
		customerData.value.country = countryName
		log.info(`Set country code to ${isd} and address country to ${countryName}`)
	} else {
		log.warn(`Country "${countryName}" not found`)
		selectedCountryCode.value = "+41"
	}
}

/** Auto-set territory based on selected country (exact or fuzzy match) */
const updateTerritoryFromCountry = () => {
	if (!territories.value.length) return

	const country = countriesStore.countries.find(
		(c) => c.isd === selectedCountryCode.value,
	)
	if (!country) return

	// Try exact match first
	if (territories.value.includes(country.name)) {
		territory.value = country.name
		log.info(`Territory set to: ${country.name}`)
		return
	}

	// Try fuzzy match
	const fuzzyMatch = territories.value.find(
		(t) =>
			t.toLowerCase().includes(country.name.toLowerCase()) ||
			country.name.toLowerCase().includes(t.toLowerCase()),
	)

	if (fuzzyMatch) {
		territory.value = fuzzyMatch
		log.info(`Territory set to fuzzy match: ${fuzzyMatch}`)
	}
}

// =============================================================================
// API Resources
// =============================================================================

const createCustomerResource = createResource({
	url: "pos_next.api.customers.create_customer",
	makeParams: () => ({
		customer_name: fullName.value,
		mobile_no: customerData.value.mobile_no || "",
		email_id: customerData.value.email_id || "",
		customer_group: customerGroup.value || defaultCustomerGroup.value,
		territory: territory.value || "All Territories",
		customer_type: customerType.value,
		pos_profile: props.posProfile,
	}),
	onError: (error) => {
		log.error("Error creating customer", error)
		showError(error.message || __("Failed to create customer"))
	},
})

const createAddressResource = createResource({
	url: "frappe.client.insert",
	auto: false,
})

const updateCustomerResource = createResource({
	url: "frappe.client.set_value",
	makeParams: () => ({
		doctype: "Customer",
		name: props.customer?.name,
		fieldname: {
			customer_name: fullName.value,
			customer_type: customerType.value,
			customer_group: customerGroup.value || defaultCustomerGroup.value,
			territory: territory.value || "All Territories",
			mobile_no: customerData.value.mobile_no || "",
			email_id: customerData.value.email_id || "",
		},
	}),
	onSuccess: (data) => {
		showSuccess(__("Customer {0} updated successfully", [data.customer_name]))
		emit("customer-updated", data)
		show.value = false
	},
	onError: (error) => {
		log.error("Error updating customer", error)
		showError(error.message || __("Failed to update customer"))
	},
})

/** Helper to create list fetch resources */
const createListResource = (doctype, onSuccess) =>
	createResource({
		url: "frappe.client.get_list",
		makeParams: () => ({
			doctype,
			fields: ["name"],
			filters: doctype === "Customer Group" ? { is_group: 0 } : {},
			limit_page_length: 500,
		}),
		auto: false,
		onSuccess: (data) => data?.length && onSuccess(data.map((d) => d.name)),
		onError: (err) => log.error(`Error loading ${doctype}`, err),
	})

const customerGroupsResource = createListResource("Customer Group", (names) => {
	customerGroups.value = names
	// Auto-select default if not already set
	if (!customerGroup.value && defaultCustomerGroup.value) {
		customerGroup.value = names.includes(defaultCustomerGroup.value)
			? defaultCustomerGroup.value
			: names[0] || ""
	}
})
const territoriesResource = createListResource(
	"Territory",
	(names) => (territories.value = names),
)

// Fetch only 'country' from POS Profile (customer_group may not exist on all versions)
const posProfileResource = createResource({
	url: "frappe.client.get_value",
	makeParams: () => ({
		doctype: "POS Profile",
		filters: { name: props.posProfile },
		fieldname: ["country"],
	}),
	auto: false,
	onSuccess: (data) => setCountryFromName(data?.country || "Switzerland"),
	onError: (err) => {
		log.error("Error loading POS Profile", err)
		selectedCountryCode.value = "+41"
	},
})

// Fetch default customer group from Selling Settings
const sellingSettingsResource = createResource({
	url: "frappe.client.get_value",
	makeParams: () => ({
		doctype: "Selling Settings",
		filters: { name: "Selling Settings" },
		fieldname: ["cust_master_group"],
	}),
	auto: false,
	onSuccess: (data) => {
		if (data?.cust_master_group) {
			defaultCustomerGroup.value = data.cust_master_group
			// Set as current if not already changed by user
			if (!customerGroup.value || customerGroup.value === "Individual") {
				customerGroup.value = data.cust_master_group
			}
		}
	},
	onError: (err) => log.error("Error loading Selling Settings", err),
})

// =============================================================================
// Dialog Lifecycle
// =============================================================================

const loadDialogData = async () => {
	// Lazy load countries (non-blocking)
	countriesStore.loadCountries()

	// Load form options in parallel
	territoriesResource.reload()
	customerGroupsResource.reload()
	sellingSettingsResource.reload()
	checkPermissions()

	// Set country from POS Profile
	if (props.posProfile) {
		await posProfileResource.reload()
	} else {
		setCountryFromName("Switzerland")
	}
}

const checkPermissions = async () => {
	checkingPermission.value = true
	try {
		hasPermission.value = await canCreateCustomer()
	} catch (err) {
		log.error("Permission check failed", err)
		hasPermission.value = false
	} finally {
		checkingPermission.value = false
	}
}

const handleCreate = async () => {
	if (!fullName.value) {
		return showError(__("Customer Name is required"))
	}

	if (isEditMode.value) {
		await updateCustomerResource.submit()
		return
	}

	try {
		// Create customer via custom endpoint (positional params, not frappe.client.insert wrapper)
		const customer = await createCustomerResource.submit()
		if (!customer?.name) {
			throw new Error(__("Customer creation returned no document"))
		}

		// Create address if address fields are filled
		const hasAddressData =
			customerData.value.address_line1 ||
			customerData.value.city ||
			customerData.value.pincode ||
			customerData.value.country

		if (hasAddressData && showAddressFields.value) {
			try {
				const address = await createAddressResource.fetch({
					doc: {
						doctype: "Address",
						address_title: fullName.value,
						address_type: "Billing",
						address_line1: customerData.value.address_line1 || "",
						city: customerData.value.city || "",
						pincode: customerData.value.pincode || "",
						country: customerData.value.country || "",
						links: [
							{
								link_doctype: "Customer",
								link_name: customer.name,
							},
						],
					},
				})

				// Set as primary address
				if (address?.name) {
					await createResource({
						url: "frappe.client.set_value",
						auto: false,
					}).fetch({
						doctype: "Customer",
						name: customer.name,
						fieldname: "customer_primary_address",
						value: address.name,
					})
				}
			} catch (addressError) {
				log.error("Error creating address", addressError)
			}
		}

		showSuccess(
			__("Customer {0} created successfully", [customer.customer_name]),
		)
		emit("customer-created", customer)
		show.value = false
	} catch (error) {
		log.error("Error creating customer", error)
		showError(error.message || __("Failed to create customer"))
	}
}

const resetForm = () => {
	customerType.value = "Individual"
	Object.assign(customerData.value, {
		company_name: "",
		first_name: "",
		last_name: "",
		mobile_no: "",
		email_id: "",
		address_line1: "",
		city: "",
		pincode: "",
		country: "",
	})
	customerGroup.value = defaultCustomerGroup.value
	territory.value = "All Territories"
	selectedCountryCode.value = "+41"
	phoneNumber.value = ""
}

// =============================================================================
// Watchers
// =============================================================================

// Pre-fill from search query (split on first space)
watch(
	() => props.initialName,
	(name) => {
		if (name) {
			const parts = name.split(" ")
			customerData.value.first_name = parts[0] || ""
			customerData.value.last_name = parts.slice(1).join(" ") || ""
		}
	},
)

// Pre-fill form when customer prop changes (edit mode)
watch(
	() => props.customer,
	(customer) => {
		if (customer?.name) {
			// Set customer type toggle
			customerType.value =
				customer.customer_type === "Company" ? "Company" : "Individual"

			if (customer.customer_type === "Company") {
				customerData.value.company_name = customer.customer_name || ""
				customerData.value.first_name = ""
				customerData.value.last_name = ""
			} else {
				customerData.value.company_name = ""
				const nameParts = (customer.customer_name || "").split(" ")
				customerData.value.first_name = nameParts[0] || ""
				customerData.value.last_name = nameParts.slice(1).join(" ") || ""
			}

			customerData.value.email_id = customer.email_id || ""
			customerGroup.value =
				customer.customer_group || defaultCustomerGroup.value
			territory.value = customer.territory || "All Territories"

			// Handle mobile_no with country code
			if (customer.mobile_no) {
				customerData.value.mobile_no = customer.mobile_no
				if (customer.mobile_no.includes("-")) {
					const [code, ...rest] = customer.mobile_no.split("-")
					selectedCountryCode.value = code
					phoneNumber.value = rest.join("-")
				} else {
					phoneNumber.value = customer.mobile_no
				}
			}
		}
	},
	{ immediate: true },
)

watch(
	() => customerData.value.mobile_no,
	(value) => {
		if (value?.includes("-")) {
			const [code, ...rest] = value.split("-")
			selectedCountryCode.value = code
			phoneNumber.value = rest.join("-")
		}
	},
)

watch(selectedCountryCode, async () => {
	await nextTick()
	updateTerritoryFromCountry()
})

watch(showCountryDropdown, async (isOpen) => {
	if (isOpen) {
		await nextTick()
		countrySearchRef.value?.focus()
	}
})

watch(
	() => props.modelValue,
	async (isOpen) => {
		show.value = isOpen
		isOpen ? await loadDialogData() : resetForm()
	},
)

watch(show, (val) => emit("update:modelValue", val))

// =============================================================================
// Lifecycle Hooks
// =============================================================================

onMounted(() => {
	loadDialogData()
	document.addEventListener("click", handleClickOutside)
})

onBeforeUnmount(() => {
	document.removeEventListener("click", handleClickOutside)
})
</script>

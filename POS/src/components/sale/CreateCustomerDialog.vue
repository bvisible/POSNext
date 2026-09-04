<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// Neoffice — upstream asks for one free-text customer_name in a tall labelled form. A Swiss
  //// counter has to know Individual vs Company (it drives the Customer Group and the invoice),
  //// needs first and last name apart, and needs the postal address with the ADR-002 street +
  //// N° split — upstream creates no Address at all. Hence the type toggle, the company field,
  //// the placeholder-only compact layout that fits one tablet screen, the +41 dial code, a
  //// country picker in place of the Territory field, and a full edit mode that re-fetches the
  //// Customer and its primary Address (616d4102 + 4b36d7be + 731374c1 2026-03-25, 8bffb770
  //// 2026-02-04, 53d87890 2026-05-28, 4a0dd461 + 8c59b735 2026-07-09, d7584e7b 2026-07-17).
  //// Note: the 34469c3 and 4bb76f2 lines below are UPSTREAM commits, blamed to the fork by
  //// mistake by the May 2026 index.
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
			<!-- //// Neoffice — the whole form was rewritten. Upstream asks for one free-text -->
			<!-- //// customer_name in a tall label-per-field layout, which is wrong for a Swiss -->
			<!-- //// counter: we need to know Individual vs Company (it drives the Customer Group -->
			<!-- //// and the invoice), and a scrollable placeholder-only form fits a tablet. Hence -->
			<!-- //// the type toggle, the company-name field and the first/last name split -->
			<!-- //// (616d4102 + 4b36d7be 2026-03-25, 731374c1 "add company name field", -->
			<!-- //// c84cc34a 2026-02-04 "make customer dialog scrollable and compact"). -->
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
					<!-- //// Neoffice — upstream had a single customer_name input. A Customer is filed here -->
					<!-- //// as first + last name so ERPNext gets structured data and the POS can rebuild -->
					<!-- //// the parts when editing (616d4102, 4b36d7be 2026-03-25). -->
					<input
						v-model="customerData.first_name"
						type="text"
						:placeholder="__('First name') + ' *'"
						class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
					/>
					<!-- //// Neoffice — the last-name half of that same split (616d4102, 4b36d7be). -->
					<input
						v-model="customerData.last_name"
						type="text"
						:placeholder="__('Last name') + ' *'"
						class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
					/>
				</div>

				<!-- //// Neoffice — the mobile row lost its label and was restyled to the Neoffice theme -->
				<!-- //// (rounded-neo, gray-50 fields); the dial code defaults to +41 instead of -->
				<!-- //// upstream's Egyptian +20 (616d4102, 731374c1 2026-03-25). -->
				<!-- Mobile Number with Country Code Selector -->
				<!-- //// Neoffice — the dial-code widget itself is upstream's (34469c37, before the fork -->
				<!-- //// point); what changed in the rows below is the Neoffice restyle and the +41 default, -->
				<!-- //// as described just above (616d4102 + 731374c1, 2026-03-25). -->
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
							<!-- //// Neoffice — country list restyled and tightened (max-h-48, lighter rows) so the -->
							<!-- //// dropdown fits above the on-screen keyboard of a POS tablet (616d4102). -->
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
									<!-- //// Neoffice — same restyle (616d4102): truncated name + muted dial code, so a long -->
									<!-- //// country name cannot push the code out of the row. -->
									<span class="flex-1 text-sm text-gray-700 truncate">{{ country.name }}</span>
									<span class="text-sm text-gray-400">{{ country.isd }}</span>
								</button>
								<div v-if="filteredCountries.length === 0" class="px-4 py-6 text-center text-sm text-gray-400">
									{{ __("No countries found") }}
								</div>
							</div>
						</div>
					</div>

					<!-- //// Neoffice — the phone input was moved out of upstream's label wrapper into the -->
					<!-- //// dial-code flex row (that is the removal just above) and restyled; the -->
					<!-- //// placeholder now carries the required mark since the labels are gone -->
					<!-- //// (616d4102 + 4b36d7be 2026-03-25). -->
					<!-- Phone Number Input -->
					<input
						v-model="phoneNumber"
						type="tel"
						:placeholder="__('Phone number') + ' *'"
						class="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-start"
						@input="updateMobileNumber"
					/>
				</div>

				<!-- //// Neoffice — upstream's labelled frappe-ui <Input> replaced by a plain input with -->
				<!-- //// a placeholder, to keep the whole form inside one tablet screen (616d4102, -->
				<!-- //// 4b36d7be 2026-03-25). -->
				<!-- Email -->
				<!-- //// Neoffice — the e-mail field of that same placeholder-only rewrite (616d4102 + -->
				<!-- //// 4b36d7be, 2026-03-25). -->
				<input
					v-model="customerData.email_id"
					type="email"
					:placeholder="__('Email') + ' *'"
					class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
				/>

				<!-- //// Neoffice — two changes here. (1) The group select is bound to the dialog's own -->
				<!-- //// customerGroup ref, not customerData.customer_group, so the Individuel/Commercial -->
				<!-- //// default can follow the type toggle (53d87890 2026-05-28). (2) Upstream has no -->
				<!-- //// address in this dialog at all; ours creates the Address record with the -->
				<!-- //// Customer, gated on a POS setting (8bffb770 2026-02-04). -->
				<!-- Customer Group -->
				<!-- //// Neoffice — the group select bound to the dialog's own ref so the default can follow -->
				<!-- //// the Individual/Company toggle; see the note above (53d87890, 2026-05-28). -->
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

					<!-- //// Neoffice — ADR-002 structured address: street and N° are separate fields (N° -->
					<!-- //// lands in Address.custom_house_number), and the row below is NPA-then-city, the -->
					<!-- //// Swiss postal order. The street box is the GeoAdmin autocomplete -->
					<!-- //// (6ed1256d 2026-04-02 Swiss address autocomplete, d7584e7b 2026-07-17 ADR-002). -->
					<!-- Swiss postal format: street + N° on one row -->
					<div class="grid grid-cols-[1fr_96px] gap-2">
						<AddressAutocomplete
							v-model="customerData.address_line1"
							:placeholder="__('Street')"
							input-class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
							@address-selected="onAddressSelected"
						/>
						<input
							v-model="customerData.house_number"
							type="text"
							:placeholder="__('N°')"
							class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						/>
					</div>

					<!-- Swiss postal format: NPA then city ("1907 Saxon") -->
					<div class="grid grid-cols-[96px_1fr] gap-2">
						<input
							v-model="customerData.pincode"
							type="text"
							:placeholder="__('Postal code')"
							class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						/>
						<input
							v-model="customerData.city"
							type="text"
							:placeholder="__('City')"
							class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
						/>
					</div>

					<!-- //// Neoffice — upstream offered a Territory picker here. Territory is an ERPNext -->
					<!-- //// sales notion a cashier has no opinion about, so the visible field is the -->
					<!-- //// address country; the territory is derived from it in updateTerritoryFromCountry -->
					<!-- //// (616d4102 2026-03-25, 8bffb770 2026-02-04). -->
					<!-- //// Neoffice — the country select that replaced upstream's Territory picker; the marker -->
					<!-- //// sits above the opening tag because the changed line is one of its attributes -->
					<!-- //// (616d4102, 2026-03-25). -->
					<select
						v-model="customerData.country"
						class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-neo-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
					>
						<!-- //// Neoffice — options now come from the countries store instead of the Territory -->
						<!-- //// list (616d4102). -->
						<option value="">{{ __("Country") }}</option>
						<option v-for="country in countriesStore.countries" :key="country.code" :value="country.name">
							{{ country.name }}
						</option>
					</select>
				<!-- //// Neoffice — closes the showAddressFields block: upstream ended a plain <div> -->
				<!-- //// here, the address group is conditional for us (8bffb770). -->
				</template>
			</div>
		</template>

		<template #actions>
			<div class="flex flex-col gap-2">
				<!-- Permission Warning -->
				<!-- //// Neoffice — radius token swapped to the Neoffice theme scale (rounded-neo-sm) -->
				<!-- //// (616d4102 2026-03-25). -->
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
					<!-- //// Neoffice — the :disabled below is gated on isFormValid, not on a bare -->
					<!-- //// customer_name: the fork validates company-vs-person and, in edit mode, drops -->
					<!-- //// the phone/email requirement that kept Save disabled for legacy customers -->
					<!-- //// (4b36d7be 2026-03-25, 8c59b735 2026-07-09). NB: the checker cannot see a -->
					<!-- //// marker for that line — it sits inside the <Button> attribute list. -->
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

//// Neoffice — Swiss address autocomplete (GeoAdmin, Federal Geoportal): the cashier types
//// a street and gets street/N°/NPA/city/country filled in. No upstream equivalent
//// (6ed1256d, 2026-04-02 "add Swiss address autocomplete to customer creation forms").
import AddressAutocomplete from "@/components/common/AddressAutocomplete.vue"
import { usePOSPermissions } from "@/composables/usePermissions"
import { useToast } from "@/composables/useToast"
import { useCountriesStore } from "@/stores/countries"
//// Neoffice — POS Settings decides whether the address block is shown at all
//// (8bffb770); the shift store came in with the default_currency work (b43dce92).
import { usePOSSettingsStore } from "@/stores/posSettings"
import { usePOSShiftStore } from "@/stores/posShift"
import { logger } from "@/utils/logger"
//// Neoffice — frappe-ui's <Input> is no longer imported: the compact form uses plain
//// inputs with placeholders instead of labelled fields (616d4102, 2026-03-25).
import { Button, Dialog, createResource } from "frappe-ui"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

const log = logger.create("CreateCustomerDialog")

// =============================================================================
// Composables & Stores
// =============================================================================

const countriesStore = useCountriesStore()
//// Neoffice — added stores (8bffb770 for the address gate, b43dce92 for the currency
//// fallback). NB posShiftStore is no longer read anywhere in this file.
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

//// Neoffice — Biome pass (458d81a9) wrapped the list; "customer-updated" is ours: the
//// dialog doubles as the edit form, which upstream does not do.
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
//// Neoffice — upstream starts with no dial code and falls back to Egypt (+20). The fleet
//// is Swiss, so +41 is the default everywhere in this file (731374c1, 4b36d7be).
const selectedCountryCode = ref("+41")
const phoneNumber = ref("")
const showCountryDropdown = ref(false)
const countrySearchQuery = ref("")
const dropdownRef = ref(null)
const countrySearchRef = ref(null)

//// Neoffice — the fork's own form state: an Individual/Company toggle, and the customer
//// group / territory held locally instead of inside customerData, so the group can follow
//// the toggle without dirtying the payload (4b36d7be, 616d4102 2026-03-25).
// Customer type toggle
const customerType = ref("Individual")

// Internal state
const customerGroup = ref("")
const defaultCustomerGroup = ref("Individual")
const territory = ref("All Territories")
const territories = ref(["All Territories"])
const customerGroups = ref([])
//// Neoffice — edit mode has no upstream equivalent, and this ref is what keeps it honest:
//// the docname of the Address loaded with the Customer, so saving updates that Address in
//// place instead of leaving a second one behind (4a0dd461 2026-07-09, 195b3d29 2026-07-17).
//// edit mode: track the loaded primary address so we update it (not duplicate)
// Holds the Address docname loaded for the customer being edited, or null.
const editingAddressName = ref(null)

const customerData = ref({
	//// Neoffice — company_name + first/last replace upstream's single customer_name; the
	//// composed value is rebuilt in fullName (731374c1, 616d4102 2026-03-25).
	company_name: "",
	first_name: "",
	last_name: "",
	mobile_no: "",
	email_id: "",
	//// Neoffice — address carried in the same form (upstream creates none). house_number is
	//// the ADR-002 N°, kept apart from the street (8bffb770 2026-02-04, d7584e7b 2026-07-17).
	// Address fields (structured: street and house number are separate)
	address_line1: "",
	house_number: "",
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

//// Neoffice — the computeds below serve the Individual/Company toggle upstream does not
//// have: isCompany decides which fields are mandatory, fullName recomposes the single
//// customer_name ERPNext still stores, and isFormValid drops the phone/email requirement in
//// edit mode — legacy customers often have neither, and requiring them left Save permanently
//// disabled (731374c1 + 4b36d7be 2026-03-25, 8c59b735 2026-07-09).
const isCompany = computed(() => customerType.value === "Company")

const fullName = computed(() => {
	if (isCompany.value && customerData.value.company_name.trim()) {
		return customerData.value.company_name.trim()
	}
	const first = customerData.value.first_name.trim()
	const last = customerData.value.last_name.trim()
	return last ? `${first} ${last}` : first
})

//// edit mode must not require phone/email — legacy customers may lack them,
// which otherwise makes the Save button permanently disabled when editing.
const isFormValid = computed(() => {
	if (isCompany.value) {
		return !!customerData.value.company_name.trim()
	}
	const hasName = !!(
		customerData.value.first_name.trim() && customerData.value.last_name.trim()
	)
	// Editing an existing customer: only the name is mandatory.
	if (isEditMode.value) return hasName
	// Creating a new customer: keep phone + email required for data quality.
	return !!(
		hasName &&
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
	customerData.value.house_number = address.house_number || ""
	customerData.value.city = address.city || ""
	customerData.value.pincode = address.pincode || ""
	if (address.country) {
		customerData.value.country = address.country
	}
}

const currentCountryCode = computed(() => {
	//// Neoffice — Biome reflow, plus the flag fallback: upstream returned "eg" when no dial
	//// code matches, we return "ch" (458d81a9 formatting, 731374c1 Switzerland default).
	const country = countriesStore.countries.find(
		(c) => c.isd === selectedCountryCode.value,
	)
	return country?.code.toLowerCase() || "ch"
})

const filteredCountries = computed(() => {
	if (!countrySearchQuery.value) return countriesStore.countries

	const query = countrySearchQuery.value.toLowerCase()
	return countriesStore.countries.filter(
		//// Neoffice — Biome pass (458d81a9): the predicate was split over three lines and given a
		//// trailing comma. Same match on name / dial code / ISO code.
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
	//// Neoffice — Biome pass (458d81a9): the ternary was wrapped. Same "<isd>-<number>" shape.
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
		//// Neoffice — Swiss default: upstream fell back to +20 (Egypt) whenever the country was
		//// unknown (731374c1, 2026-03-25 "add company name field and default to Switzerland").
		selectedCountryCode.value = "+41"
		return
	}

	const isd = countriesStore.countryNameToISDMap[countryName]
	if (isd) {
		selectedCountryCode.value = isd
		//// Neoffice — the country picked for the phone also preselects the address country, so
		//// the cashier does not set it twice (71619d17, 2026-02-04).
		// Also preselect country in address field
		customerData.value.country = countryName
		log.info(`Set country code to ${isd} and address country to ${countryName}`)
	} else {
		log.warn(`Country "${countryName}" not found`)
		//// Neoffice — same Swiss default on the not-found branch, +41 instead of +20 (731374c1).
		selectedCountryCode.value = "+41"
	}
}

/** Auto-set territory based on selected country (exact or fuzzy match) */
const updateTerritoryFromCountry = () => {
	if (!territories.value.length) return

	//// Neoffice — Biome pass (458d81a9): the find() call was wrapped. Same lookup.
	const country = countriesStore.countries.find(
		(c) => c.isd === selectedCountryCode.value,
	)
	if (!country) return

	// Try exact match first
	if (territories.value.includes(country.name)) {
		//// Neoffice — territory now lives in its own ref, not in customerData: the payload is
		//// built from the refs at submit time (616d4102, 2026-03-25).
		territory.value = country.name
		log.info(`Territory set to: ${country.name}`)
		return
	}

	// Try fuzzy match
	const fuzzyMatch = territories.value.find(
		//// Neoffice — Biome pass (458d81a9): the fuzzy predicate was wrapped. Same matching.
		(t) =>
			t.toLowerCase().includes(country.name.toLowerCase()) ||
			country.name.toLowerCase().includes(t.toLowerCase()),
	)

	if (fuzzyMatch) {
		//// Neoffice — same move to the territory ref (616d4102).
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
		//// Neoffice — the name sent to the backend is the composed fullName (company name, or
		//// first + last), since upstream's single customer_name field no longer exists
		//// (b6dd7f10 2026-05-28: makeParams is driven by the real reactive state).
		customer_name: fullName.value,
		mobile_no: customerData.value.mobile_no || "",
		email_id: customerData.value.email_id || "",
		//// Neoffice — group/territory/type come from the dialog refs. customer_type is ours:
		//// upstream never asked whether the customer is a company (b6dd7f10, 4b36d7be).
		customer_group: customerGroup.value || defaultCustomerGroup.value,
		territory: territory.value || "All Territories",
		customer_type: customerType.value,
		pos_profile: props.posProfile,
	}),
	//// Neoffice — upstream announced success and closed the dialog from the resource's
	//// onSuccess. We removed it: handleCreate awaits submit() so it can still create and link
	//// the Address before telling the cashier it is done (b6dd7f10, 2026-05-28).
	onError: (error) => {
		log.error("Error creating customer", error)
		showError(error.message || __("Failed to create customer"))
	},
})

//// Neoffice — no upstream equivalent: the Address record created alongside the Customer
//// when the POS profile shows the address block (8bffb770, 2026-02-04). auto:false so it
//// never fires on mount (b6dd7f10).
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
			//// Neoffice — the update path writes the same fork fields as the create path: composed
			//// name, customer_type, and the group/territory refs (4b36d7be, 616d4102, b6dd7f10).
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

//// Neoffice — the cart only carries a lightweight customer (name, mobile, mail), so the edit
//// form opened almost empty. Edit mode re-fetches the full Customer and its primary Address
//// before the form is shown (4a0dd461, 2026-07-09 "smoother customer selection & full edit
//// form").
//// edit mode: the cart only holds a lightweight customer (name/mobile/email)
// so the edit form looked empty. Fetch the full Customer doc (+ primary
// address) when opening in edit mode to pre-fill every field.
const getCustomerResource = createResource({
	url: "frappe.client.get",
	auto: false,
})

const getAddressResource = createResource({
	url: "frappe.client.get",
	auto: false,
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

//// Neoffice — upstream took the default group from Selling Settings, which is
//// "Association" on our sites: every cashier had to correct every new customer. The
//// preferred group now follows the type toggle (Individuel / Commercial), with Selling
//// Settings kept only as a fallback (53d87890, 2026-05-28). The territory resource just
//// got wrapped by the Biome pass.
// Map the customer-type toggle to the preferred default Customer Group.
// Localised swiss POS UX convention: Individuel for Individual, Commercial for Company.
// Falls back to ERPNext's Selling Settings default, then to the first available group.
function preferredGroupFor(type) {
	const preferred = type === "Company" ? "Commercial" : "Individuel"
	if (customerGroups.value.includes(preferred)) return preferred
	if (defaultCustomerGroup.value && customerGroups.value.includes(defaultCustomerGroup.value)) {
		return defaultCustomerGroup.value
	}
	return customerGroups.value[0] || ""
}

const customerGroupsResource = createListResource("Customer Group", (names) => {
	customerGroups.value = names
	// Auto-select the customer-type-aware default (Individuel / Commercial).
	customerGroup.value = preferredGroupFor(customerType.value)
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
	//// Neoffice — Switzerland, not upstream's "Egypt", when the POS Profile has no country
	//// (4b36d7be, 731374c1 2026-03-25).
	onSuccess: (data) => setCountryFromName(data?.country || "Switzerland"),
	onError: (err) => {
		log.error("Error loading POS Profile", err)
		//// Neoffice — Swiss dial-code default on the error path too (+41, not +20) (731374c1).
		selectedCountryCode.value = "+41"
	},
})

//// Neoffice — added resource. It only feeds the fallback chain of preferredGroupFor: it
//// must NOT win over the Individuel/Commercial default, which is exactly the bug
//// 53d87890 (2026-05-28) fixed.
// Fetch default customer group from Selling Settings.
// IMPORTANT: this is only stored as a fallback for preferredGroupFor(); it does NOT
// override the customer-type-aware default (Individuel / Commercial) chosen above.
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
		}
	},
	//// Neoffice — part of the same added resource (53d87890): a missing or unreadable Selling
	//// Settings must not block customer creation, so the error is only logged.
	onError: (err) => log.error("Error loading Selling Settings", err),
})

// =============================================================================
// Dialog Lifecycle
// =============================================================================

const loadDialogData = async () => {
	// Lazy load countries (non-blocking)
	countriesStore.loadCountries()

	//// Neoffice — the territory fetch is no longer awaited: the dialog must open at once on a
	//// POS tablet, so the option lists load in parallel behind the form (4b36d7be).
	// Load form options in parallel
	territoriesResource.reload()
	customerGroupsResource.reload()
	//// Neoffice — added with the Selling Settings fallback (53d87890, 4b36d7be).
	sellingSettingsResource.reload()
	checkPermissions()

	// Set country from POS Profile
	if (props.posProfile) {
		await posProfileResource.reload()
	} else {
		//// Neoffice — with no POS Profile, upstream just parked the dial code on +20. We resolve
		//// the full Swiss default (dial code + address country) (4b36d7be, 731374c1).
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

//// Neoffice — no upstream equivalent. Editing a customer used to leave the address behind:
//// the form showed it but nothing wrote it back. This updates the primary Address in place,
//// or creates and links one, mirroring the create path (4a0dd461 2026-07-09 "smoother
//// customer selection & full edit form"; 195b3d29 2026-07-17 added custom_house_number,
//// which both write paths were dropping).
// Edit mode: persist the address alongside the customer. Updates the existing
// primary address if one was loaded, otherwise creates + links a new one —
// mirroring the create flow so editing an address actually saves.
const persistAddressForEdit = async () => {
	if (!showAddressFields.value) return

	const hasAddressData =
		customerData.value.address_line1 ||
		customerData.value.city ||
		customerData.value.pincode ||
		customerData.value.country
	if (!hasAddressData) return

	try {
		if (editingAddressName.value) {
			// Update the existing primary address in place
			await createResource({
				url: "frappe.client.set_value",
				auto: false,
			}).fetch({
				doctype: "Address",
				name: editingAddressName.value,
				fieldname: {
					address_line1: customerData.value.address_line1 || "",
					custom_house_number: customerData.value.house_number || "",
					city: customerData.value.city || "",
					pincode: customerData.value.pincode || "",
					country: customerData.value.country || "",
				},
			})
		} else {
			// No address yet — create one and set it as the customer's primary
			const address = await createAddressResource.fetch({
				doc: {
					doctype: "Address",
					address_title: fullName.value,
					address_type: "Billing",
					address_line1: customerData.value.address_line1 || "",
					custom_house_number: customerData.value.house_number || "",
					city: customerData.value.city || "",
					pincode: customerData.value.pincode || "",
					country: customerData.value.country || "",
					links: [
						{
							link_doctype: "Customer",
							link_name: props.customer.name,
						},
					],
				},
			})
			if (address?.name) {
				await createResource({
					url: "frappe.client.set_value",
					auto: false,
				}).fetch({
					doctype: "Customer",
					name: props.customer.name,
					fieldname: "customer_primary_address",
					value: address.name,
				})
				editingAddressName.value = address.name
			}
		}
	} catch (addressError) {
		log.error("Error saving customer address", addressError)
	}
}

const handleCreate = async () => {
	//// Neoffice — guards on the composed fullName, since upstream's customer_name field is
	//// gone (616d4102, b6dd7f10).
	if (!fullName.value) {
		return showError(__("Customer Name is required"))
	}

	if (isEditMode.value) {
		await updateCustomerResource.submit()
		//// Neoffice — everything below is ours. Upstream just called insert and let the resource's
		//// onSuccess close the dialog. We (a) persist the address on the edit path, (b) await
		//// submit() on the create path so the Address can be created and linked as the customer's
		//// primary before the dialog closes, and (c) report the failure to the cashier instead of
		//// only logging it (8bffb770 2026-02-04, b6dd7f10 2026-05-28, 4a0dd461 2026-07-09,
		//// d7584e7b 2026-07-17 for custom_house_number).
		await persistAddressForEdit()
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
						custom_house_number: customerData.value.house_number || "",
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
	//// Neoffice — the reset covers the fork's own state. Type toggle back to Individual
	//// (4b36d7be, 2026-03-25).
	customerType.value = "Individual"
	Object.assign(customerData.value, {
		//// Neoffice — company/first/last instead of upstream's single customer_name (731374c1).
		company_name: "",
		first_name: "",
		last_name: "",
		mobile_no: "",
		email_id: "",
		//// Neoffice — address fields cleared too; house_number is the ADR-002 N° (8bffb770,
		//// d7584e7b).
		address_line1: "",
		house_number: "",
		city: "",
		pincode: "",
		country: "",
	})
	//// Neoffice — reset to the fork's defaults: the type-aware group (Individuel/Commercial)
	//// and +41, where upstream reset the group to "Individual" and blanked the dial code
	//// (53d87890 2026-05-28, 731374c1 2026-03-25).
	customerGroup.value = preferredGroupFor(customerType.value)
	territory.value = "All Territories"
	selectedCountryCode.value = "+41"
	phoneNumber.value = ""
	//// Neoffice — forget the Address loaded for the previous edit, or the next save would
	//// overwrite someone else's address (4a0dd461, 2026-07-09).
	editingAddressName.value = null
}

// =============================================================================
// Watchers
// =============================================================================

//// Neoffice — the search term typed in the customer search is split on the first space to
//// prefill first/last name; upstream dropped it whole into customer_name (616d4102).
// Pre-fill from search query (split on first space)
watch(
	() => props.initialName,
	//// Neoffice — the handler itself is ours: upstream assigned the search term whole to
	//// customer_name; we split it on the first space into first/last (616d4102).
	(name) => {
		if (name) {
			const parts = name.split(" ")
			customerData.value.first_name = parts[0] || ""
			customerData.value.last_name = parts.slice(1).join(" ") || ""
		}
	},
)

//// Neoffice — everything from here to loadFullCustomerForEdit is ours. (1) The type toggle
//// swaps the default group unless the cashier already picked one (53d87890). (2) Upstream
//// prefilled the edit form inline from the prop; the cart only carries a lightweight
//// customer (name/mobile/email), so the form looked empty — applyCustomerDoc is reusable
//// and loadFullCustomerForEdit fetches the real doc plus its primary address
//// (4a0dd461, 2026-07-09 "smoother customer selection & full edit form").
// Toggle Individu ↔ Société — swap the default Customer Group accordingly
// (Individuel for Individu, Commercial for Société), but ONLY if the user
// hasn't manually picked a different group already in this dialog session.
// We detect "manually picked" by comparing the current value against the
// alternate type's preferred default.
watch(customerType, (newType, oldType) => {
	if (!customerGroups.value.length) return
	const previousPreferred = preferredGroupFor(oldType)
	if (customerGroup.value === previousPreferred || !customerGroup.value) {
		customerGroup.value = preferredGroupFor(newType)
	}
})

// Populate the form fields from a customer object (lightweight cart object OR
// the full doc fetched from the backend). Safe to call repeatedly.
const applyCustomerDoc = (customer) => {
	if (!customer?.name) return

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
	if (customer.customer_group) customerGroup.value = customer.customer_group
	if (customer.territory) territory.value = customer.territory

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

// Fetch the FULL customer doc (+ primary address) so every field is pre-filled.
// The cart-supplied object is lightweight (name/mobile/email only), which left
// the edit form looking empty — this enriches it once the dialog opens.
const loadFullCustomerForEdit = async () => {
	const name = props.customer?.name
	if (!name) return
	try {
		const doc = await getCustomerResource.fetch({
			doctype: "Customer",
			name,
		})
		if (doc) applyCustomerDoc(doc)

		// Load the linked primary address (only if the form shows address fields)
		const addressName = doc?.customer_primary_address
		if (addressName && showAddressFields.value) {
			const addr = await getAddressResource.fetch({
				doctype: "Address",
				name: addressName,
			})
			if (addr) {
				customerData.value.address_line1 = addr.address_line1 || ""
				customerData.value.city = addr.city || ""
				customerData.value.pincode = addr.pincode || ""
				customerData.value.country = addr.country || ""
				editingAddressName.value = addr.name
			}
		}
	//// Neoffice — a failed enrichment must not blank the form: the lightweight prefill stays
	//// and we only log (4a0dd461, 2026-07-09).
	} catch (error) {
		log.error("Error loading full customer for edit", error)
	}
}

// Instant pre-fill from the lightweight prop (name shows immediately); the full
// doc fetch on dialog open then enriches the remaining fields.
watch(() => props.customer, applyCustomerDoc, { immediate: true })

watch(
	() => customerData.value.mobile_no,
	(value) => {
		if (value?.includes("-")) {
			const [code, ...rest] = value.split("-")
			selectedCountryCode.value = code
			phoneNumber.value = rest.join("-")
		}
	//// Neoffice — Biome pass (458d81a9): trailing comma on the watcher callback. No change.
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
		//// Neoffice — on open, edit mode also pulls the full customer doc and its address, which
		//// upstream never needed (it had no edit mode here) (4a0dd461, 2026-07-09).
		if (isOpen) {
			await loadDialogData()
			// Edit mode: enrich the form with the full customer doc + address.
			if (props.customer?.name) await loadFullCustomerForEdit()
		} else {
			resetForm()
		}
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
//// Neoffice — upstream ended the file with a <style scoped> block defining .sr-only, which
//// nothing in the template ever used; the compact rewrite dropped it (616d4102, 2026-03-25).
</script>

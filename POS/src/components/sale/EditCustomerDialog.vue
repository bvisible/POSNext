<!--
  EditCustomerDialog — customer editor for the POS, kept as a dialog so the
  cashier never leaves the SPA (PWA / tablet).

  Two tabs:
    • Détails       — identity fields, driven by the Customer doctype meta
                      (custom fields included), trimmed server-side to what a
                      cashier needs.
    • Adresses & Contacts — manage the customer's addresses and contacts
                      (list / edit inline / add), reusing the neoffice_theme
                      backend so the ID-follows-title rename logic is identical
                      to the desk.
-->
<template>
	<Dialog v-model="show" :options="{ title: __('Edit Customer'), size: '3xl' }">
		<template #body-content>
			<div v-if="loading" class="py-12 text-center">
				<div class="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
				<p class="mt-3 text-sm text-gray-500">{{ __('Loading customer…') }}</p>
			</div>

			<div v-else class="flex flex-col gap-3">
				<!-- Tab bar -->
				<div class="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
					<button
						type="button"
						@click="activeTab = 'details'"
						:class="tabClass('details')"
					>
						{{ __('Details') }}
					</button>
					<button
						type="button"
						@click="activeTab = 'contacts'"
						:class="tabClass('contacts')"
					>
						{{ __('Addresses & Contacts') }}
					</button>
				</div>

				<!-- DETAILS TAB (meta-driven) -->
				<div v-show="activeTab === 'details'" class="flex flex-col gap-4">
					<div v-for="(section, sIdx) in detailSections" :key="sIdx">
						<h4 v-if="section.label" class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
							{{ section.label }}
						</h4>
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
							<template v-for="field in section.fields" :key="field.fieldname">
								<div v-if="isVisible(field)" :class="isWide(field) ? 'sm:col-span-2' : ''">
									<label class="block text-xs font-medium text-gray-600 mb-1">
										{{ field.label }}
										<span v-if="field.reqd" class="text-red-500">*</span>
									</label>

									<label v-if="field.fieldtype === 'Check'" class="flex items-center gap-2 cursor-pointer">
										<input type="checkbox" :checked="!!values[field.fieldname]"
											@change="(e) => (values[field.fieldname] = e.target.checked ? 1 : 0)"
											:disabled="field.read_only"
											class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
										<span class="text-sm text-gray-700">{{ field.description || __('Yes') }}</span>
									</label>

									<div v-else-if="field.read_only || field.fieldtype === 'Read Only'"
										class="px-3 py-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg min-h-[38px] whitespace-pre-line">
										{{ readOnlyDisplay(values[field.fieldname]) }}
									</div>

									<select v-else-if="field.fieldtype === 'Select'"
										:value="values[field.fieldname]"
										@change="(e) => (values[field.fieldname] = e.target.value)"
										class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
										<option v-for="opt in selectOptions(field)" :key="opt" :value="opt">{{ opt || '—' }}</option>
									</select>

									<LinkField v-else-if="field.fieldtype === 'Link'"
										:model-value="values[field.fieldname]"
										@update:model-value="(v) => (values[field.fieldname] = v)"
										:doctype="field.options" :placeholder="field.label" :disabled="field.read_only" />

									<textarea v-else-if="['Text', 'Small Text', 'Long Text', 'Text Editor'].includes(field.fieldtype)"
										:value="values[field.fieldname]"
										@input="(e) => (values[field.fieldname] = e.target.value)"
										rows="2" :placeholder="field.label"
										class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"></textarea>

									<input v-else-if="['Int', 'Float', 'Currency', 'Percent'].includes(field.fieldtype)"
										:value="values[field.fieldname]"
										@input="(e) => (values[field.fieldname] = e.target.value)"
										type="number" :step="field.fieldtype === 'Int' ? '1' : '0.01'" :placeholder="field.label"
										class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />

									<input v-else-if="['Date', 'Datetime'].includes(field.fieldtype)"
										:value="values[field.fieldname]"
										@input="(e) => (values[field.fieldname] = e.target.value)"
										:type="field.fieldtype === 'Date' ? 'date' : 'datetime-local'"
										class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />

									<input v-else :value="values[field.fieldname]"
										@input="(e) => (values[field.fieldname] = e.target.value)"
										:type="field.fieldtype === 'Phone' ? 'tel' : 'text'" :placeholder="field.label"
										class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
								</div>
							</template>
						</div>
					</div>
				</div>

				<!-- ADDRESSES & CONTACTS TAB -->
				<div v-show="activeTab === 'contacts'" class="flex flex-col gap-5">
					<div v-if="relLoading" class="py-6 text-center text-sm text-gray-500">{{ __('Loading…') }}</div>

					<template v-else>
						<!-- ADDRESSES -->
						<section>
							<div class="flex items-center justify-between mb-2">
								<h4 class="text-sm font-semibold text-gray-700">{{ __('Addresses') }}</h4>
								<Button v-if="!addressDraft" variant="subtle" @click="startAddAddress">+ {{ __('Add address') }}</Button>
							</div>

							<!-- inline address editor -->
							<div v-if="addressDraft" class="border border-blue-200 bg-blue-50/40 rounded-lg p-3 mb-3">
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
									<div class="sm:col-span-2">
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Address Title') }}</label>
										<input v-model="addressDraft.address_title" type="text" :placeholder="__('Address Title')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Address Type') }}</label>
										<select v-model="addressDraft.address_type" :class="inputCls">
											<option v-for="t in ADDRESS_TYPES" :key="t" :value="t">{{ __(t) }}</option>
										</select>
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Country') }}</label>
										<LinkField v-model="addressDraft.country" doctype="Country" :placeholder="__('Country')" />
									</div>
									<!-- Swiss postal format: street + N° on one row -->
									<div class="sm:col-span-2 grid grid-cols-[1fr_96px] gap-2">
										<div>
											<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Address Line 1') }}</label>
											<input v-model="addressDraft.address_line1" type="text" :placeholder="__('Address Line 1')" :class="inputCls" />
										</div>
										<div>
											<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('N°') }}</label>
											<input v-model="addressDraft.custom_house_number" type="text" :placeholder="__('N°')" :class="inputCls" />
										</div>
									</div>
									<div class="sm:col-span-2">
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Address Line 2') }}</label>
										<input v-model="addressDraft.address_line2" type="text" :placeholder="__('Address Line 2')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Postal Code') }}</label>
										<input v-model="addressDraft.pincode" type="text" :placeholder="__('Postal Code')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('City/Town') }}</label>
										<input v-model="addressDraft.city" type="text" :placeholder="__('City/Town')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('State/Province') }}</label>
										<input v-model="addressDraft.state" type="text" :placeholder="__('State/Province')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Email Address') }}</label>
										<input v-model="addressDraft.email_id" type="email" :placeholder="__('Email Address')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Phone') }}</label>
										<input v-model="addressDraft.phone" type="tel" :placeholder="__('Phone')" :class="inputCls" />
									</div>
									<div class="sm:col-span-2 flex flex-wrap gap-4 pt-1">
										<label class="flex items-center gap-2 cursor-pointer">
											<input type="checkbox" v-model="addressDraft.is_primary_address" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
											<span class="text-sm text-gray-700">{{ __('Preferred Billing Address') }}</span>
										</label>
										<label class="flex items-center gap-2 cursor-pointer">
											<input type="checkbox" v-model="addressDraft.is_shipping_address" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
											<span class="text-sm text-gray-700">{{ __('Preferred Shipping Address') }}</span>
										</label>
									</div>
								</div>
								<div class="flex justify-end gap-2 mt-3">
									<Button variant="subtle" @click="addressDraft = null">{{ __('Cancel') }}</Button>
									<Button variant="solid" theme="blue" :loading="relSaving" @click="saveAddress">{{ __('Save') }}</Button>
								</div>
							</div>

							<div v-if="!addresses.length && !addressDraft" class="text-sm text-gray-400 py-2">{{ __('No addresses yet.') }}</div>
							<div v-else class="flex flex-col gap-2">
								<div v-for="addr in addresses" :key="addr.name"
									class="flex items-start justify-between gap-2 border border-gray-200 rounded-lg p-3">
									<div class="min-w-0">
										<div class="flex flex-wrap items-center gap-1.5 mb-1">
											<span class="text-sm font-medium text-gray-900 truncate">{{ addr.address_title || addr.name }}</span>
											<span v-if="addr.is_primary_address" class="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">{{ __('Billing') }}</span>
											<span v-if="addr.is_shipping_address" class="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">{{ __('Shipping') }}</span>
										</div>
										<div class="text-xs text-gray-500 whitespace-pre-line" v-html="sanitizeDisplay(addr.display)"></div>
									</div>
									<Button variant="subtle" @click="startEditAddress(addr)">{{ __('Edit') }}</Button>
								</div>
							</div>
						</section>

						<!-- CONTACTS -->
						<section>
							<div class="flex items-center justify-between mb-2">
								<h4 class="text-sm font-semibold text-gray-700">{{ __('Contacts') }}</h4>
								<Button v-if="!contactDraft" variant="subtle" @click="startAddContact">+ {{ __('Add contact') }}</Button>
							</div>

							<div v-if="contactDraft" class="border border-blue-200 bg-blue-50/40 rounded-lg p-3 mb-3">
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('First Name') }}</label>
										<input v-model="contactDraft.first_name" type="text" :placeholder="__('First Name')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Last Name') }}</label>
										<input v-model="contactDraft.last_name" type="text" :placeholder="__('Last Name')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Email Address') }}</label>
										<input v-model="contactDraft.email" type="email" :placeholder="__('Email Address')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Mobile No') }}</label>
										<input v-model="contactDraft.mobile_no" type="tel" :placeholder="__('Mobile No')" :class="inputCls" />
									</div>
									<div class="sm:col-span-2">
										<label class="flex items-center gap-2 cursor-pointer">
											<input type="checkbox" v-model="contactDraft.is_primary_contact" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
											<span class="text-sm text-gray-700">{{ __('Primary Contact') }}</span>
										</label>
									</div>
								</div>
								<div class="flex justify-end gap-2 mt-3">
									<Button variant="subtle" @click="contactDraft = null">{{ __('Cancel') }}</Button>
									<Button variant="solid" theme="blue" :loading="relSaving" @click="saveContact">{{ __('Save') }}</Button>
								</div>
							</div>

							<div v-if="!contacts.length && !contactDraft" class="text-sm text-gray-400 py-2">{{ __('No contacts yet.') }}</div>
							<div v-else class="flex flex-col gap-2">
								<div v-for="c in contacts" :key="c.name"
									class="flex items-start justify-between gap-2 border border-gray-200 rounded-lg p-3">
									<div class="min-w-0">
										<div class="flex flex-wrap items-center gap-1.5 mb-0.5">
											<span class="text-sm font-medium text-gray-900 truncate">{{ c.full_name }}</span>
											<span v-if="c.is_primary_contact" class="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">{{ __('Primary') }}</span>
										</div>
										<div class="text-xs text-gray-500 truncate">
											<span v-if="c.mobile_no">{{ c.mobile_no }}</span>
											<span v-if="c.mobile_no && c.email_id" class="text-gray-300"> · </span>
											<span v-if="c.email_id">{{ c.email_id }}</span>
										</div>
									</div>
									<Button variant="subtle" @click="startEditContact(c)">{{ __('Edit') }}</Button>
								</div>
							</div>
						</section>
					</template>
				</div>
			</div>
		</template>

		<template #actions>
			<div class="flex justify-end gap-2">
				<Button variant="subtle" @click="show = false">{{ __('Close') }}</Button>
				<Button v-if="activeTab === 'details'" variant="solid" theme="blue" :loading="saving" :disabled="loading || saving" @click="save">
					{{ __('Save Changes') }}
				</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { Button, Dialog, call, createResource } from "frappe-ui"
import { computed, ref, watch } from "vue"
import { useToast } from "@/composables/useToast"
import LinkField from "@/components/common/LinkField.vue"

const props = defineProps({
	modelValue: { type: Boolean, required: true },
	customer: { type: [String, Object], default: null },
})

const emit = defineEmits(["update:modelValue", "customer-updated"])

const { showSuccess, showError } = useToast()

const ADDRESS_TYPES = ["Billing", "Shipping", "Office", "Personal", "Other"]
const inputCls =
	"w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"

const show = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
})

const activeTab = ref("details")
const tabs = ref([])
const values = ref({})
const saving = ref(false)

// addresses & contacts state
const addresses = ref([])
const contacts = ref([])
const relLoading = ref(false)
const relSaving = ref(false)
const addressDraft = ref(null) // {name|null, ...fields}
const contactDraft = ref(null)

const customerName = computed(() =>
	typeof props.customer === "string" ? props.customer : props.customer?.name,
)

const detailSections = computed(() => (tabs.value[0] ? tabs.value[0].sections : []))

const formResource = createResource({ url: "pos_next.api.customers.get_customer_form", auto: false })
const loading = computed(() => formResource.loading)
const saveResource = createResource({ url: "pos_next.api.customers.save_customer_form", auto: false })

function tabClass(tab) {
	return [
		"px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors",
		activeTab.value === tab ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100",
	]
}

async function load() {
	tabs.value = []
	values.value = {}
	activeTab.value = "details"
	addressDraft.value = null
	contactDraft.value = null
	if (!customerName.value) return
	try {
		const data = await formResource.submit({ customer: customerName.value })
		tabs.value = data.tabs || []
		values.value = { ...(data.values || {}) }
	} catch (error) {
		showError(error.message || __("Failed to load customer"))
	}
	loadRelations()
}

async function loadRelations() {
	relLoading.value = true
	try {
		const data = await call("pos_next.api.customers.get_customer_addresses_contacts", {
			customer: customerName.value,
		})
		addresses.value = data?.addresses || []
		contacts.value = data?.contacts || []
	} catch (error) {
		console.error("Failed to load addresses/contacts", error)
	} finally {
		relLoading.value = false
	}
}

// ---- details field helpers ----
function selectOptions(field) {
	return (field.options || "").split("\n")
}
function isWide(field) {
	return ["Text", "Small Text", "Long Text", "Text Editor"].includes(field.fieldtype)
}
function readOnlyDisplay(value) {
	if (value === null || value === undefined || value === "") return "—"
	return (
		String(value)
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<[^>]*>/g, " ")
			.replace(/&nbsp;/gi, " ")
			.replace(/[ \t]+/g, " ")
			.replace(/\n{2,}/g, "\n")
			.replace(/^\s+|\s+$/g, "") || "—"
	)
}
function isVisible(field) {
	const cond = field.depends_on
	if (!cond) return true
	try {
		let expr = cond.trim()
		expr = expr.startsWith("eval:") ? expr.slice(5) : `doc["${expr}"]`
		// eslint-disable-next-line no-new-func
		return !!new Function("doc", `return (${expr})`)(values.value)
	} catch {
		return true
	}
}
// Address display HTML is server-rendered from a trusted template; only <br>
// and plain text survive our sanitize.
function sanitizeDisplay(html) {
	if (!html) return ""
	return String(html).replace(/<(?!br\s*\/?>)[^>]*>/gi, " ")
}

// ---- addresses ----
function startAddAddress() {
	contactDraft.value = null
	addressDraft.value = {
		name: null,
		address_title: values.value.customer_name || "",
		address_type: "Billing",
		address_line1: "",
		custom_house_number: "",
		address_line2: "",
		pincode: "",
		city: "",
		state: "",
		country: "",
		email_id: "",
		phone: "",
		is_primary_address: false,
		is_shipping_address: false,
	}
}
async function startEditAddress(addr) {
	contactDraft.value = null
	// The list rows carry a subset; fetch the full Address for the editor.
	try {
		const d = (await call("frappe.client.get", { doctype: "Address", name: addr.name })) || {}
		addressDraft.value = {
			name: addr.name,
			address_title: d.address_title || "",
			address_type: d.address_type || "Billing",
			address_line1: d.address_line1 || "",
			custom_house_number: d.custom_house_number || "",
			address_line2: d.address_line2 || "",
			pincode: d.pincode || "",
			city: d.city || "",
			state: d.state || "",
			country: d.country || "",
			email_id: d.email_id || "",
			phone: d.phone || "",
			is_primary_address: !!d.is_primary_address,
			is_shipping_address: !!d.is_shipping_address,
		}
	} catch (error) {
		showError(error.message || __("Failed to load address"))
	}
}
async function saveAddress() {
	relSaving.value = true
	try {
		const fields = { ...addressDraft.value }
		const address_name = fields.name
		delete fields.name
		fields.is_primary_address = fields.is_primary_address ? 1 : 0
		fields.is_shipping_address = fields.is_shipping_address ? 1 : 0
		await call("pos_next.api.customers.save_customer_address", {
			customer: customerName.value,
			fields: JSON.stringify(fields),
			address_name,
		})
		showSuccess(__("Address saved"))
		addressDraft.value = null
		await loadRelations()
	} catch (error) {
		showError(error.message || __("Failed to save address"))
	} finally {
		relSaving.value = false
	}
}

// ---- contacts ----
function startAddContact() {
	addressDraft.value = null
	contactDraft.value = {
		name: null,
		first_name: "",
		last_name: "",
		email: "",
		mobile_no: "",
		is_primary_contact: false,
	}
}
function startEditContact(c) {
	addressDraft.value = null
	contactDraft.value = {
		name: c.name,
		first_name: c.first_name || "",
		last_name: c.last_name || "",
		email: c.email_id || "",
		mobile_no: c.mobile_no || "",
		is_primary_contact: !!c.is_primary_contact,
	}
}
async function saveContact() {
	relSaving.value = true
	try {
		const fields = { ...contactDraft.value }
		const contact_name = fields.name
		delete fields.name
		fields.is_primary_contact = fields.is_primary_contact ? 1 : 0
		await call("pos_next.api.customers.save_customer_contact", {
			customer: customerName.value,
			fields: JSON.stringify(fields),
			contact_name,
		})
		showSuccess(__("Contact saved"))
		contactDraft.value = null
		await loadRelations()
	} catch (error) {
		showError(error.message || __("Failed to save contact"))
	} finally {
		relSaving.value = false
	}
}

// ---- customer details save (with rename) ----
async function save() {
	if (!customerName.value) return
	saving.value = true
	try {
		const data = await saveResource.submit({
			customer: customerName.value,
			values: JSON.stringify(values.value),
		})
		emit("customer-updated", data)
		show.value = false
	} catch (error) {
		showError(error.message || __("Failed to update customer"))
	} finally {
		saving.value = false
	}
}

watch(show, (isOpen) => {
	if (isOpen) load()
})
</script>

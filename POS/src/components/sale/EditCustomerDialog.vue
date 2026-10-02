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
	<!-- //// Neoffice — added file (no upstream equivalent). Upstream sends the cashier to -->
	<!-- //// the desk to edit a customer, a dead end on a PWA tablet. This editor is driven -->
	<!-- //// by the Customer doctype meta (custom fields show up on their own) and keeps a -->
	<!-- //// second tab for addresses and contacts backed by neoffice_theme, so the -->
	<!-- //// ID-follows-title rename behaves exactly like the desk. (82fbfd9e 2026-07-10 -->
	<!-- //// "full meta-driven customer edit dialog (stays in the POS)"; 5221894d lighter -->
	<!-- //// two-tab layout + address/contact manager; 970934de decode HTML entities in -->
	<!-- //// labels and strip HTML from read-only fields; 7e697fdd window.frappe has no -->
	<!-- //// .call in the SPA, so the fetches failed silently — use frappe-ui call(); -->
	<!-- //// d7584e7b 2026-07-17 the ADR-002 N° next to Address Line 1; 2026-10-02 maintenance#1032: -->
	<!-- //// the address editor gains the name printed on documents, « to the attention of » (filled -->
	<!-- //// from a contact) and the delivery instructions, the contact editor the salutation, the job -->
	<!-- //// title and every e-mail and number of the Contact's two tables, as the desk's address book.) -->
	<Dialog v-model="show" :options="{ title: __('Edit Customer'), size: '5xl' }">
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
				<!-- Addresses on the left, contacts on the right (maintenance#1032): less to scroll. -->
				<div v-show="activeTab === 'contacts'" class="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-5 items-start">
					<div v-if="relLoading" class="lg:col-span-2 py-6 text-center text-sm text-gray-500">{{ __('Loading…') }}</div>

					<template v-else>
						<!-- ADDRESSES -->
						<section>
							<div class="flex items-center justify-between mb-2">
								<h4 class="text-sm font-semibold text-gray-700">{{ __('Addresses', null, 'Address book') }}</h4>
								<Button v-if="!addressDraft" variant="subtle" @click="startAddAddress">+ {{ __('Add an address') }}</Button>
							</div>

							<!-- inline address editor -->
							<div v-if="addressDraft" class="border border-blue-200 bg-blue-50/40 rounded-lg p-3 mb-3">
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Address Title', null, 'Address book') }}</label>
										<input v-model="addressDraft.address_title" type="text" :placeholder="__('Address Title', null, 'Address book')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Address Type', null, 'Address book') }}</label>
										<select v-model="addressDraft.address_type" :class="inputCls">
											<option v-for="t in ADDRESS_TYPES" :key="t" :value="t">{{ __(t, null, 'Address type') }}</option>
										</select>
									</div>
									<!-- The envelope's lines in the order the print writes them (Daniel, 02.10): the name printed
									     instead of the customer's, « to the attention of », then the street, before the town. -->
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Name on documents') }}</label>
										<input v-model="addressDraft.company" type="text" :class="inputCls" />
										<p class="mt-1 text-[11px] text-gray-400">{{ __('Replaces the name printed on invoices and letters') }}</p>
									</div>
									<div class="relative">
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('To the attention of') }}</label>
										<input v-model="addressDraft.to_the_attention_of" type="text" :class="inputCls" />
										<button v-if="contacts.length" type="button" class="mt-1 text-xs font-semibold text-blue-600" @click="attentionMenu = !attentionMenu">
											{{ __('Choose a contact', null, 'Address book') }}
										</button>
										<div v-if="attentionMenu" class="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
											<button v-for="c in contacts" :key="c.name" type="button"
												class="block w-full rounded px-2 py-1.5 text-left text-sm text-gray-800 hover:bg-gray-100"
												@click="addressDraft.to_the_attention_of = c.full_name; attentionMenu = false">
												{{ c.full_name }}<span v-if="c.designation" class="text-gray-400"> · {{ c.designation }}</span>
											</button>
										</div>
									</div>
									<!-- Swiss postal format: street + N° on one row -->
									<div class="sm:col-span-2 grid grid-cols-[1fr_96px] gap-2">
										<div>
											<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Address Line 1', null, 'Address book') }}</label>
											<input v-model="addressDraft.address_line1" type="text" :placeholder="__('Address Line 1', null, 'Address book')" :class="inputCls" />
										</div>
										<div>
											<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('N°') }}</label>
											<input v-model="addressDraft.custom_house_number" type="text" :placeholder="__('N°')" :class="inputCls" />
										</div>
									</div>
									<div class="sm:col-span-2">
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Address Line 2', null, 'Address book') }}</label>
										<input v-model="addressDraft.address_line2" type="text" :placeholder="__('Address Line 2', null, 'Address book')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Postal Code', null, 'Address book') }}</label>
										<input v-model="addressDraft.pincode" type="text" :placeholder="__('Postal Code', null, 'Address book')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('City/Town', null, 'Address book') }}</label>
										<input v-model="addressDraft.city" type="text" :placeholder="__('City/Town', null, 'Address book')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('State/Province', null, 'Address book') }}</label>
										<input v-model="addressDraft.state" type="text" :placeholder="__('State/Province', null, 'Address book')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Country', null, 'Address book') }}</label>
										<LinkField v-model="addressDraft.country" doctype="Country" :placeholder="__('Country', null, 'Address book')" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Email Address', null, 'Address book') }}</label>
										<input v-model="addressDraft.email_id" type="email" :placeholder="__('Email Address', null, 'Address book')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Phone', null, 'Address book') }}</label>
										<input v-model="addressDraft.phone" type="tel" :placeholder="__('Phone', null, 'Address book')" :class="inputCls" />
									</div>
									<div v-if="addressDraft.address_type === 'Shipping' || addressDraft.neo_delivery_instructions" class="sm:col-span-2">
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Delivery instructions') }}</label>
										<textarea v-model="addressDraft.neo_delivery_instructions" rows="2" :class="inputCls"></textarea>
									</div>
									<div class="sm:col-span-2 flex flex-wrap gap-4 pt-1">
										<label class="flex items-center gap-2 cursor-pointer">
											<input type="checkbox" v-model="addressDraft.is_primary_address" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
											<span class="text-sm text-gray-700">{{ __('Preferred Billing Address', null, 'Address book') }}</span>
										</label>
										<label class="flex items-center gap-2 cursor-pointer">
											<input type="checkbox" v-model="addressDraft.is_shipping_address" class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
											<span class="text-sm text-gray-700">{{ __('Preferred Shipping Address', null, 'Address book') }}</span>
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
											<span v-if="addr.is_primary_address" class="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">{{ __('Preferred billing', null, 'Address book') }}</span>
											<span v-if="addr.is_shipping_address" class="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">{{ __('Preferred delivery', null, 'Address book') }}</span>
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
								<h4 class="text-sm font-semibold text-gray-700">{{ __('Contacts', null, 'Address book') }}</h4>
								<Button v-if="!contactDraft" variant="subtle" @click="startAddContact">+ {{ __('Add a contact', null, 'Address book') }}</Button>
							</div>

							<div v-if="contactDraft" class="border border-blue-200 bg-blue-50/40 rounded-lg p-3 mb-3">
								<div class="grid grid-cols-1 sm:grid-cols-[140px_1fr_1fr] gap-x-4 gap-y-3">
									<div v-if="salutations.length">
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Salutation', null, 'Address book') }}</label>
										<select v-model="contactDraft.salutation" :class="inputCls">
											<option value=""></option>
											<option v-for="s in salutations" :key="s.value" :value="s.value">{{ s.label }}</option>
										</select>
									</div>
									<div :class="salutations.length ? '' : 'sm:col-span-2'">
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('First Name') }}</label>
										<input v-model="contactDraft.first_name" type="text" :placeholder="__('First Name')" :class="inputCls" />
									</div>
									<div>
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Last Name', null, 'Address book') }}</label>
										<input v-model="contactDraft.last_name" type="text" :class="inputCls" />
									</div>
									<div class="sm:col-span-3">
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Designation', null, 'Address book') }}</label>
										<input v-model="contactDraft.designation" type="text" :class="inputCls" />
									</div>
									<!-- One row per e-mail and per number, as in the Contact's own tables; one primary per column. -->
									<div class="sm:col-span-3">
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('E-mails', null, 'Address book') }}</label>
										<div v-for="(row, i) in contactDraft.email_ids" :key="'e' + i" class="flex items-center gap-3 mb-1.5">
											<input v-model="row.email_id" type="email" :class="inputCls" />
											<label class="flex shrink-0 items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
												<input type="radio" :checked="!!row.is_primary" @change="setPrimary(contactDraft.email_ids, 'is_primary', i)" />
												{{ __('Primary', null, 'Contact row') }}
											</label>
											<button type="button" class="shrink-0 rounded border border-gray-200 px-2 text-gray-500 hover:bg-gray-100" :title="__('Remove', null, 'Address book')" @click="removeRow(contactDraft.email_ids, i, ['is_primary'])">×</button>
										</div>
										<button type="button" class="text-xs font-semibold text-blue-600" @click="addRow(contactDraft.email_ids, { email_id: '', is_primary: 0 }, ['is_primary'])">
											+ {{ __('Add an e-mail', null, 'Address book') }}
										</button>
									</div>
									<div class="sm:col-span-3">
										<label class="block text-xs font-medium text-gray-600 mb-1">{{ __('Numbers', null, 'Address book') }}</label>
										<div v-for="(row, i) in contactDraft.phone_nos" :key="'p' + i" class="flex flex-wrap items-center gap-3 mb-1.5">
											<input v-model="row.phone" type="tel" :class="[inputCls, 'min-w-0 flex-1']" />
											<label class="flex shrink-0 items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
												<input type="radio" :checked="!!row.is_primary_phone" @change="setPrimary(contactDraft.phone_nos, 'is_primary_phone', i)" />
												{{ __('Primary', null, 'Contact row') }}
											</label>
											<label class="flex shrink-0 items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
												<input type="radio" :checked="!!row.is_primary_mobile_no" @change="setPrimary(contactDraft.phone_nos, 'is_primary_mobile_no', i)" />
												{{ __('Primary mobile', null, 'Contact row') }}
											</label>
											<button type="button" class="shrink-0 rounded border border-gray-200 px-2 text-gray-500 hover:bg-gray-100" :title="__('Remove', null, 'Address book')" @click="removeRow(contactDraft.phone_nos, i, ['is_primary_phone', 'is_primary_mobile_no'])">×</button>
										</div>
										<button type="button" class="text-xs font-semibold text-blue-600" @click="addRow(contactDraft.phone_nos, { phone: '', is_primary_phone: 0, is_primary_mobile_no: 0 }, ['is_primary_phone', 'is_primary_mobile_no'])">
											+ {{ __('Add a number', null, 'Address book') }}
										</button>
									</div>
									<div class="sm:col-span-3">
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
											<span v-if="c.is_primary_contact" class="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded">{{ __('Primary', null, 'Contact card') }}</span>
										</div>
										<div v-if="c.designation" class="text-xs italic text-gray-500">{{ c.designation }}</div>
										<div v-if="contactEmails(c).length" class="text-xs text-gray-500 break-all">{{ contactEmails(c).join(' · ') }}</div>
										<div v-if="contactPhones(c).length" class="text-xs text-gray-500">{{ contactPhones(c).join(' · ') }}</div>
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
const attentionMenu = ref(false)
const salutations = ref([]) // [{ value, label }], loaded once

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
		loadSalutations()
	} catch (error) {
		console.error("Failed to load addresses/contacts", error)
	} finally {
		relLoading.value = false
	}
}

// Salutations for the contact editor: two records can read the same once translated (« Mr » and
// « Monsieur »), one line each. A cashier who may not read them gets no salutation field.
async function loadSalutations() {
	if (salutations.value.length) return
	try {
		const rows = await call("frappe.client.get_list", {
			doctype: "Salutation",
			fields: ["name"],
			order_by: "name asc",
			limit_page_length: 100,
		})
		const seen = new Set()
		salutations.value = (rows || [])
			.map((r) => ({ value: r.name, label: __(r.name) }))
			.filter((s) => !seen.has(s.label) && seen.add(s.label))
	} catch {
		salutations.value = []
	}
}

// A contact as the server lists it, with its two tables; an older server sent one e-mail and one
// number only (email_id, mobile_no), read here as one-row tables.
function contactTables(c) {
	return {
		emails: c.email_ids || (c.email_id ? [{ email_id: c.email_id, is_primary: 1 }] : []),
		phones:
			c.phone_nos || (c.mobile_no ? [{ phone: c.mobile_no, is_primary_phone: 1, is_primary_mobile_no: 1 }] : []),
	}
}
function contactEmails(c) {
	return contactTables(c)
		.emails.slice()
		.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
		.map((e) => e.email_id)
}
function contactPhones(c) {
	const main = (p) => (p.is_primary_phone || p.is_primary_mobile_no ? 1 : 0)
	return contactTables(c)
		.phones.slice()
		.sort((a, b) => main(b) - main(a))
		.map((p) => p.phone)
}
// One primary per column: ticking a row unticks the others; a column with rows and none ticked
// takes its first row, as the server does.
function setPrimary(rows, flag, index) {
	rows.forEach((r, i) => {
		r[flag] = i === index ? 1 : 0
	})
}
function settle(rows, flags) {
	for (const flag of flags) {
		if (rows.length && !rows.some((r) => r[flag])) rows[0][flag] = 1
	}
}
function addRow(rows, row, flags) {
	rows.push(row)
	settle(rows, flags)
}
function removeRow(rows, index, flags) {
	rows.splice(index, 1)
	settle(rows, flags)
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
		company: "",
		to_the_attention_of: "",
		neo_delivery_instructions: "",
		is_primary_address: false,
		is_shipping_address: false,
	}
	attentionMenu.value = false
}
async function startEditAddress(addr) {
	contactDraft.value = null
	attentionMenu.value = false
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
			company: d.company || "",
			to_the_attention_of: d.to_the_attention_of || "",
			neo_delivery_instructions: d.neo_delivery_instructions || "",
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
		salutation: "",
		first_name: "",
		last_name: "",
		designation: "",
		email_ids: [{ email_id: "", is_primary: 1 }],
		phone_nos: [{ phone: "", is_primary_phone: 1, is_primary_mobile_no: 1 }],
		is_primary_contact: !contacts.value.length,
	}
}
function startEditContact(c) {
	addressDraft.value = null
	const t = contactTables(c)
	const emails = t.emails.map((e) => ({ email_id: e.email_id || "", is_primary: e.is_primary ? 1 : 0 }))
	const phones = t.phones.map((p) => ({
		phone: p.phone || "",
		is_primary_phone: p.is_primary_phone ? 1 : 0,
		is_primary_mobile_no: p.is_primary_mobile_no ? 1 : 0,
	}))
	if (!emails.length) emails.push({ email_id: "", is_primary: 1 })
	if (!phones.length) phones.push({ phone: "", is_primary_phone: 1, is_primary_mobile_no: 1 })
	settle(emails, ["is_primary"])
	settle(phones, ["is_primary_phone", "is_primary_mobile_no"])
	contactDraft.value = {
		name: c.name,
		salutation: c.salutation || "",
		first_name: c.first_name || "",
		last_name: c.last_name || "",
		designation: c.designation || "",
		email_ids: emails,
		phone_nos: phones,
		is_primary_contact: !!c.is_primary_contact,
	}
}
async function saveContact() {
	const draft = contactDraft.value
	if (!(draft.first_name || "").trim() && !(draft.last_name || "").trim()) {
		showError(__("First or last name is required."))
		return
	}
	// Every row goes back to the server, which replaces the two tables with them: a removed row is
	// gone, the others stay (an edit used to keep only one e-mail and one number).
	const email_ids = draft.email_ids.filter((r) => (r.email_id || "").trim())
	const wrong = email_ids.find((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email_id.trim()))
	if (wrong) {
		showError(__("{0} is not a valid e-mail address", [wrong.email_id], "Address book"))
		return
	}
	relSaving.value = true
	try {
		const fields = {
			salutation: draft.salutation || "",
			first_name: draft.first_name,
			last_name: draft.last_name,
			designation: draft.designation || "",
			is_primary_contact: draft.is_primary_contact ? 1 : 0,
			email_ids,
			phone_nos: draft.phone_nos.filter((r) => (r.phone || "").trim()),
		}
		await call("pos_next.api.customers.save_customer_contact", {
			customer: customerName.value,
			fields: JSON.stringify(fields),
			contact_name: draft.name,
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

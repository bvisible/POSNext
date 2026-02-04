<template>
	<div class="bg-white dark:bg-gray-800 h-full flex flex-col">
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
			<h2 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
				<FeatherIcon name="user-plus" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
				{{ __("New Customer") }}
			</h2>
			<button
				class="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
				@click="$emit('close')"
			>
				<FeatherIcon name="x" class="w-5 h-5" />
			</button>
		</div>

		<!-- Form -->
		<form class="flex-1 p-4 space-y-4 overflow-y-auto" @submit.prevent="handleSubmit">
			<!-- Error message -->
			<div v-if="error" class="p-3 bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg">
				<p class="text-red-700 dark:text-red-300 text-sm">{{ error }}</p>
			</div>

			<!-- Customer name -->
			<div class="space-y-1">
				<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
					{{ __("Customer Name") }} <span class="text-red-500 dark:text-red-400">*</span>
				</label>
				<input
					v-model="form.customer_name"
					type="text"
					required
					:placeholder="__('Enter customer name')"
					class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					:disabled="isSubmitting"
				/>
			</div>

			<!-- Email -->
			<div class="space-y-1">
				<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
					{{ __("Email") }}
				</label>
				<input
					v-model="form.email"
					type="email"
					:placeholder="__('customer@example.com')"
					class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					:disabled="isSubmitting"
				/>
			</div>

			<!-- Mobile number -->
			<div class="space-y-1">
				<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
					{{ __("Mobile Number") }}
				</label>
				<input
					v-model="form.mobile_no"
					type="tel"
					:placeholder="__('Phone number')"
					class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					:disabled="isSubmitting"
				/>
			</div>

			<!-- Address fields (conditional) -->
			<template v-if="showAddress">
				<!-- Address Line 1 -->
				<div class="space-y-1">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						{{ __("Address") }}
					</label>
					<input
						v-model="form.address_line1"
						type="text"
						:placeholder="__('Street address')"
						class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						:disabled="isSubmitting"
					/>
				</div>

				<!-- City and Postal Code -->
				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1">
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
							{{ __("City") }}
						</label>
						<input
							v-model="form.city"
							type="text"
							:placeholder="__('City')"
							class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							:disabled="isSubmitting"
						/>
					</div>
					<div class="space-y-1">
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
							{{ __("Postal Code") }}
						</label>
						<input
							v-model="form.pincode"
							type="text"
							:placeholder="__('Postal code')"
							class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							:disabled="isSubmitting"
						/>
					</div>
				</div>

				<!-- Country -->
				<div class="space-y-1">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						{{ __("Country") }}
					</label>
					<input
						v-model="form.country"
						type="text"
						:placeholder="__('Country')"
						class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						:disabled="isSubmitting"
					/>
				</div>
			</template>
		</form>

		<!-- Footer -->
		<div class="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
			<button
				:disabled="isSubmitting || !form.customer_name"
				class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2"
				@click="handleSubmit"
			>
				<FeatherIcon
					v-if="isSubmitting"
					name="loader"
					class="w-4 h-4 animate-spin"
				/>
				<span>{{ isSubmitting ? __("Creating...") : __("Create Customer") }}</span>
			</button>

			<button
				type="button"
				:disabled="isSubmitting"
				class="w-full py-2 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 rounded-lg font-medium text-gray-700 dark:text-gray-300 transition-colors"
				@click="$emit('close')"
			>
				{{ __("Cancel") }}
			</button>
		</div>
	</div>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
import { reactive, ref, computed } from "vue"
import { useCustomerDisplayStore } from "@/stores/customerDisplay"

const props = defineProps({
	showAddress: {
		type: Boolean,
		default: true,
	},
})

const emit = defineEmits(["close", "created"])

const displayStore = useCustomerDisplayStore()

// Get default country from session (company country)
const defaultCountry = displayStore.sessionInfo?.country || ""

const form = reactive({
	customer_name: "",
	email: "",
	mobile_no: "",
	// Address fields
	address_line1: "",
	city: "",
	pincode: "",
	country: defaultCountry,
})

const isSubmitting = ref(false)
const error = ref(null)

async function handleSubmit() {
	if (!form.customer_name) return

	isSubmitting.value = true
	error.value = null

	try {
		const customerData = {
			customer_name: form.customer_name.trim(),
			email: form.email.trim() || null,
			mobile_no: form.mobile_no.trim() || null,
		}

		// Add address fields if provided
		if (props.showAddress) {
			if (form.address_line1.trim()) customerData.address_line1 = form.address_line1.trim()
			if (form.city.trim()) customerData.city = form.city.trim()
			if (form.pincode.trim()) customerData.pincode = form.pincode.trim()
			if (form.country.trim()) customerData.country = form.country.trim()
		}

		const customer = await displayStore.createCustomer(customerData)

		// Reset form (keep default country)
		form.customer_name = ""
		form.email = ""
		form.mobile_no = ""
		form.address_line1 = ""
		form.city = ""
		form.pincode = ""
		form.country = defaultCountry

		// Emit created event
		emit("created", customer)
	} catch (err) {
		error.value = err.message || __("Failed to create customer")
	} finally {
		isSubmitting.value = false
	}
}
</script>

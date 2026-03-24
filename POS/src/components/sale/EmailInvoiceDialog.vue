<template>
	<Dialog v-model="show" :options="{ title: __('Email Invoice'), size: 'md' }">
		<template #body-content>
			<div v-if="loading" class="flex items-center justify-center py-8">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
			<div v-else class="flex flex-col gap-4">
				<!-- Recipient -->
				<div>
					<label class="block text-start text-sm font-medium text-gray-700 mb-1">
						{{ __("To") }} <span class="text-red-500">*</span>
					</label>
					<Input
						v-model="emailData.recipient"
						type="email"
						:placeholder="__('Enter email address')"
					/>
				</div>

				<!-- Subject -->
				<div>
					<label class="block text-start text-sm font-medium text-gray-700 mb-1">
						{{ __("Subject") }}
					</label>
					<Input
						v-model="emailData.subject"
						type="text"
						:placeholder="__('Invoice subject')"
					/>
				</div>

				<!-- Message -->
				<div>
					<label class="block text-start text-sm font-medium text-gray-700 mb-1">
						{{ __("Message") }}
					</label>
					<textarea
						v-model="emailData.message"
						rows="4"
						class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
						:placeholder="__('Email message')"
					></textarea>
				</div>

				<!-- PDF Attachment info -->
				<div class="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600">
					<FeatherIcon name="paperclip" class="w-4 h-4" />
					<span>{{ __("PDF attached:") }} <strong>{{ emailData.print_format || "POS Next Receipt" }}</strong></span>
				</div>

				<!-- Error message -->
				<div v-if="errorMessage" class="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
					{{ errorMessage }}
				</div>
			</div>
		</template>
		<template #actions>
			<div class="flex gap-2">
				<Button variant="subtle" @click="show = false" :disabled="sending">
					{{ __("Cancel") }}
				</Button>
				<Button
					variant="solid"
					theme="blue"
					:disabled="!canSend || sending"
					:loading="sending"
					@click="sendEmail"
				>
					<template #prefix>
						<FeatherIcon name="send" class="w-4 h-4" />
					</template>
					{{ __("Send Email") }}
				</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { ref, computed, watch } from "vue"
import { Button, Dialog, Input, FeatherIcon } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"

const props = defineProps({
	invoiceName: { type: String, default: "" },
})

const show = defineModel({ type: Boolean, default: false })
const { showSuccess, showError } = useToast()

const loading = ref(false)
const sending = ref(false)
const errorMessage = ref("")

const emailData = ref({
	recipient: "",
	subject: "",
	message: "",
	print_format: "",
})

const canSend = computed(() => {
	return emailData.value.recipient && emailData.value.recipient.includes("@")
})

// Fetch email context when dialog opens
watch(show, async (val) => {
	if (val && props.invoiceName) {
		await fetchEmailContext()
	}
	if (!val) {
		errorMessage.value = ""
	}
})

async function fetchEmailContext() {
	loading.value = true
	errorMessage.value = ""
	try {
		const ctx = await call("pos_next.api.email.get_invoice_email_context", {
			invoice_name: props.invoiceName,
		})
		emailData.value = {
			recipient: ctx.recipient || "",
			subject: ctx.subject || "",
			message: ctx.message || "",
			print_format: ctx.print_format || "POS Next Receipt",
		}
	} catch (err) {
		console.error("Failed to load email context:", err)
		// Fallback defaults
		emailData.value = {
			recipient: "",
			subject: `Invoice ${props.invoiceName}`,
			message: "",
			print_format: "POS Next Receipt",
		}
	} finally {
		loading.value = false
	}
}

async function sendEmail() {
	if (!canSend.value) return

	sending.value = true
	errorMessage.value = ""
	try {
		await call("pos_next.api.email.send_invoice_email", {
			invoice_name: props.invoiceName,
			recipients: emailData.value.recipient,
			subject: emailData.value.subject,
			message: emailData.value.message,
			print_format: emailData.value.print_format,
		})
		showSuccess(__("Email sent to {0}", [emailData.value.recipient]))
		show.value = false
	} catch (err) {
		console.error("Failed to send email:", err)
		errorMessage.value = err?.message || err?.exc || __("Failed to send email. Please check your email configuration.")
		showError(__("Failed to send email"))
	} finally {
		sending.value = false
	}
}
</script>

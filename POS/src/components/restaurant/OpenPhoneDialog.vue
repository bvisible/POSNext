<template>
	<!-- //// Neoffice — added file (no upstream equivalent). « Open the till on a device » (it was « Open a smartphone »: a tablet opens the till by its code too, Daniel 01.11; NeoResto lot 1, kitchen test 01.11): a waiter's phone is -->
	<!-- //// not paired like a kitchen's tablet, it signs in with its owner's own account. What the manager needs is somewhere to GIVE the -->
	<!-- //// till's address, so that nobody types it for the first time: a QR code to scan with the phone's camera, and the same link to copy -->
	<!-- //// and send. Nothing secret in it, so it makes no token and has no time limit. -->
	<Dialog v-model="show" :options="{ title: __('Open the till on a device'), size: 'lg' }">
		<template #body-content>
			<div class="flex flex-col items-center gap-4 text-center" data-test="open-phone">
				<div
					class="h-[200px] w-[200px] flex-shrink-0 rounded-[10px] bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
					data-test="phone-qr"
					v-html="qr"
				></div>
				<p class="max-w-[36ch] text-sm text-gray-700">
					{{ __("Scan this code with the camera of the phone or tablet: the till opens, with no address to type. The staff member then signs in with their own account.") }}
				</p>
				<div class="w-full text-left">
					<p class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ __("Or send this link") }}</p>
					<div class="mt-1.5 flex items-center gap-2">
						<input
							type="text"
							readonly
							:value="link"
							data-test="phone-link"
							class="min-h-[40px] min-w-0 flex-1 rounded-[10px] border border-gray-200 bg-[#FAF8F5] px-3 text-sm text-gray-900"
							@focus="$event.target.select()"
						/>
						<button
							type="button"
							data-test="phone-copy"
							class="min-h-[40px] flex-shrink-0 rounded-[10px] bg-[#141414] px-4 text-sm font-medium text-white hover:bg-black"
							@click="copy"
						>
							{{ copied ? __("Link copied") : __("Copy the link") }}
						</button>
					</div>
				</div>
				<p class="text-xs text-gray-500">
					{{ __("To open it like an app, install it from the browser's menu (Install the app).") }}
				</p>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { computed, onMounted, ref } from "vue"
import { Dialog } from "frappe-ui"
import QRCode from "qrcode"
import { useToast } from "@/composables/useToast"

const props = defineProps({
	modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(["update:modelValue"])
const show = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
})

const { showError } = useToast()
// The till's address: the one this page was opened at (the site's own, whatever its domain)
const link = `${window.location.origin}/pos`
const qr = ref("")
const copied = ref(false)

async function copy() {
	try {
		await navigator.clipboard.writeText(link)
		copied.value = true
	} catch (error) {
		console.error("Failed to copy the link:", error)
		copied.value = false
		showError(__("Could not copy the link."))
	}
}

onMounted(async () => {
	try {
		qr.value = await QRCode.toString(link, {
			type: "svg",
			margin: 1,
			errorCorrectionLevel: "M",
			color: { dark: "#141414", light: "#FFFFFF" },
		})
	} catch (error) {
		console.error("Failed to draw the QR code:", error)
	}
})
</script>

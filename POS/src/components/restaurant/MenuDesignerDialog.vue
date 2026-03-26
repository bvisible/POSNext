<template>
	<Transition name="fade">
		<div v-if="show" class="fixed inset-0 bg-black bg-opacity-60 z-[400]" @click.self="$emit('close')">
			<div class="fixed inset-0 flex items-center justify-center p-4">
				<div class="w-full h-full max-w-[98vw] max-h-[98vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
					<!-- Header -->
					<div class="flex items-center justify-between px-6 py-3 border-b bg-gradient-to-r from-purple-50 to-indigo-50 flex-shrink-0">
						<div class="flex items-center gap-3">
							<h2 class="text-lg font-bold text-gray-800">{{ __('Menu Designer') }}</h2>
							<span class="text-sm text-gray-500">{{ cardName }}</span>
						</div>
						<button @click="$emit('close')" class="text-gray-400 hover:text-gray-600">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>

					<!-- Content -->
					<div class="flex-1 flex overflow-hidden">
						<!-- Loading -->
						<div v-if="loading" class="flex-1 flex items-center justify-center">
							<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
						</div>

						<template v-else>
							<!-- Preview (70%) -->
							<div class="flex-1 overflow-hidden">
								<MenuPreview
									:card="previewData.card"
									:categories="previewData.categories"
									:template="activeTemplate"
									:currency="previewData.currency"
								/>
							</div>

							<!-- Settings (30%) -->
							<div class="w-80 flex-shrink-0 border-l overflow-hidden">
								<MenuSettings
									:templates="templates"
									:current-template="activeTemplate"
									:card-name="cardName"
									:cards="cards"
									@update:config="onConfigUpdate"
									@generate-pdf="onGeneratePdf"
								/>
							</div>
						</template>
					</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup>
import { ref, computed, onMounted } from "vue"
import MenuPreview from "./MenuPreview.vue"
import MenuSettings from "./MenuSettings.vue"
import { useToast } from "@/composables/useToast"

const props = defineProps({
	show: { type: Boolean, default: false },
	cardName: { type: String, required: true },
	cards: { type: Array, default: () => [] },
})

defineEmits(["close"])

const { showSuccess, showError } = useToast()
const loading = ref(true)
const templates = ref([])
const previewData = ref({
	card: {},
	categories: [],
	template: {},
	currency: "CHF",
})
const configOverrides = ref({})

const activeTemplate = computed(() => {
	const base = previewData.value.template || {}
	return { ...base, ...configOverrides.value }
})

async function loadData() {
	loading.value = true
	try {
		const [previewRes, templatesRes] = await Promise.all([
			window.frappe.call({
				method: "pos_next.api.menu_pdf.get_menu_preview_data",
				args: { card_name: props.cardName },
			}),
			window.frappe.call({
				method: "pos_next.api.menu_pdf.get_design_templates",
			}),
		])

		previewData.value = previewRes.message || previewData.value
		templates.value = templatesRes.message || []
	} catch (e) {
		console.error("Failed to load menu designer data:", e)
		showError(__("Failed to load menu data"))
	} finally {
		loading.value = false
	}
}

function onConfigUpdate(config) {
	configOverrides.value = config

	// If template changed, reload preview with new template
	if (config.template_name) {
		const tpl = templates.value.find((t) => t.name === config.template_name)
		if (tpl) {
			previewData.value.template = { ...tpl }
		}
	}
}

async function onGeneratePdf({
	card_names,
	template_name,
	overrides,
	paper_format,
}) {
	try {
		const isMulti = card_names.length > 1
		const method = isMulti
			? "pos_next.api.menu_pdf.generate_multi_card_pdf"
			: "pos_next.api.menu_pdf.generate_menu_pdf"

		const args = isMulti
			? {
					card_names: JSON.stringify(card_names),
					template_name,
					overrides: JSON.stringify(overrides),
					paper_format,
				}
			: {
					card_name: card_names[0],
					template_name,
					overrides: JSON.stringify(overrides),
					paper_format,
				}

		// Trigger download via hidden link (avoids popup blockers)
		const url = `/api/method/${method}?${new URLSearchParams(args).toString()}`
		const link = document.createElement("a")
		link.href = url
		link.download = ""
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)

		showSuccess(__("PDF generated"))
	} catch (e) {
		console.error("PDF generation failed:", e)
		showError(__("Failed to generate PDF"))
	}
}

onMounted(() => {
	if (props.cardName) loadData()
})
</script>

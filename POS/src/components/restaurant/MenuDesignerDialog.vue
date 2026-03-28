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
							<!-- Preview (70%) - renders same HTML as PDF -->
							<div class="flex-1 overflow-hidden">
								<MenuPreview
									:card-name="cardName"
									:card-names="selectedCardNames"
									:template-name="selectedTemplateName"
									:overrides="configOverrides"
									:refresh-key="previewRefreshKey"
								/>
							</div>

							<!-- Settings (30%) -->
							<div class="w-80 flex-shrink-0 border-l overflow-hidden">
								<MenuSettings
									:templates="templates"
									:current-template="activeTemplate"
									:card-name="cardName"
									:cards="cards"
									:show-cover-page="showCoverPage"
									:save-status="saveStatus"
									:pdf-status="pdfStatus"
									@update:config="onConfigUpdate"
									@update:cover-page="showCoverPage = $event"
									@generate-pdf="onGeneratePdf"
									@save-design="onSaveDesign"
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
import { call } from "@/utils/apiWrapper"

const props = defineProps({
	show: { type: Boolean, default: false },
	cardName: { type: String, required: true },
	cards: { type: Array, default: () => [] },
})

defineEmits(["close"])

const loading = ref(true)
const templates = ref([])
const showCoverPage = ref(true)
const selectedCardNames = ref([])
const extraCardData = ref({})
const previewData = ref({
	card: {},
	categories: [],
	design: {},
	currency: "CHF",
	company_logo: "",
})
const configOverrides = ref({})
const selectedTemplateName = ref("")
const previewRefreshKey = ref(0)
// Button feedback status: null | 'saving' | 'saved' | 'error'
const saveStatus = ref(null)
const pdfStatus = ref(null)

const activeTemplate = computed(() => {
	const base = previewData.value.design || {}
	// Collect option groups from all selected cards
	const extraGroups = Object.values(extraCardData.value).flatMap(
		(d) => d.option_groups || [],
	)
	return {
		...base,
		...configOverrides.value,
		option_groups: previewData.value.option_groups || [],
		extra_option_groups: extraGroups,
	}
})

// Combine categories from main card + extra selected cards
const allCategories = computed(() => {
	const main = previewData.value.categories || []
	const extras = Object.values(extraCardData.value).flatMap(
		(d) => d.categories || [],
	)
	return [...main, ...extras]
})

async function loadData() {
	loading.value = true
	try {
		const [previewRes, templatesRes] = await Promise.all([
			call("pos_next.api.menu_pdf.get_menu_preview_data", {
				card_name: props.cardName,
			}),
			call("pos_next.api.menu_pdf.get_design_templates"),
		])

		previewData.value = previewRes || previewData.value
		templates.value = templatesRes || []
		selectedCardNames.value = [props.cardName]

		// Restore saved template selection
		if (previewData.value.design?.name) {
			selectedTemplateName.value = previewData.value.design.name
		}
	} catch (e) {
		console.error("Failed to load menu designer data:", e)
		showError(__("Failed to load menu data"))
	} finally {
		loading.value = false
	}
}

function onConfigUpdate(newConfig) {
	// If template changed, update the base design
	if (
		newConfig.template_name &&
		newConfig.template_name !== previewData.value.design?.name
	) {
		const tpl = templates.value.find((t) => t.name === newConfig.template_name)
		if (tpl) {
			previewData.value = { ...previewData.value, design: { ...tpl } }
		}
	}

	// Update selected cards for multi-card preview
	if (newConfig.selected_cards) {
		selectedCardNames.value = newConfig.selected_cards
		loadExtraCards(newConfig.selected_cards)
	}

	const { template_name, selected_cards, ...overrides } = newConfig
	if (template_name) {
		selectedTemplateName.value = template_name
	}
	configOverrides.value = overrides
	// Refresh preview with new settings
	previewRefreshKey.value++
}

async function loadExtraCards(cardNames) {
	const newExtras = {}
	for (const name of cardNames) {
		if (name === props.cardName) continue
		if (extraCardData.value[name]) {
			newExtras[name] = extraCardData.value[name]
			continue
		}
		try {
			const data = await call("pos_next.api.menu_pdf.get_menu_preview_data", {
				card_name: name,
			})
			newExtras[name] = data
		} catch (e) {
			console.error("Failed to load extra card:", name, e)
		}
	}
	extraCardData.value = newExtras
}

async function onSaveDesign() {
	saveStatus.value = "saving"
	try {
		const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || ""
		const response = await fetch(
			"/api/method/pos_next.api.menu_pdf.save_card_design",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Frappe-CSRF-Token": csrfToken,
				},
				body: JSON.stringify({
					card_name: props.cardName,
					template_name: activeTemplate.value?.name || "",
					overrides: JSON.stringify(configOverrides.value),
				}),
			},
		)
		const data = await response.json()
		if (data?.message?.status === "ok") {
			saveStatus.value = "saved"
		} else {
			saveStatus.value = "error"
		}
	} catch (e) {
		console.error("Failed to save design:", e)
		saveStatus.value = "error"
	}
	setTimeout(() => {
		saveStatus.value = null
	}, 2500)
}

async function onGeneratePdf({
	card_names,
	template_name,
	overrides,
	paper_format,
}) {
	pdfStatus.value = "generating"
	try {
		const isMulti = card_names.length > 1
		const method = isMulti
			? "pos_next.api.menu_pdf.generate_multi_card_pdf"
			: "pos_next.api.menu_pdf.generate_menu_pdf"

		// Serialize overrides safely (avoid double-encoding reactive Vue objects)
		const safeOverrides = JSON.stringify(
			Object.fromEntries(
				Object.entries(overrides || {}).filter(
					([k]) => k !== "selected_cards",
				),
			),
		)
		const args = isMulti
			? {
					card_names: JSON.stringify(card_names),
					template_name,
					overrides: safeOverrides,
					paper_format,
				}
			: {
					card_name: card_names[0],
					template_name,
					overrides: safeOverrides,
					paper_format,
				}

		// Use POST + blob download (GET returns 404 on Frappe whitelisted methods)
		const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] || ""
		const response = await fetch(`/api/method/${method}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Frappe-CSRF-Token": csrfToken,
			},
			body: JSON.stringify(args),
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`)
		}

		const blob = await response.blob()
		const blobUrl = URL.createObjectURL(blob)
		const a = document.createElement("a")
		a.href = blobUrl
		a.download = `menu_${card_names[0].replace(/ /g, "_")}.pdf`
		a.click()
		URL.revokeObjectURL(blobUrl)

		pdfStatus.value = "done"
	} catch (e) {
		console.error("PDF generation failed:", e)
		pdfStatus.value = "error"
	}
	setTimeout(() => {
		pdfStatus.value = null
	}, 3000)
}

onMounted(() => {
	if (props.cardName) loadData()
})
</script>

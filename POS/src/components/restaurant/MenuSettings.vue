<template>
	<div class="h-full flex flex-col bg-white">
		<!-- Header -->
		<div class="px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-indigo-50 flex-shrink-0">
			<h3 class="font-bold text-sm text-gray-800">{{ __('Menu Settings') }}</h3>
		</div>

		<div class="flex-1 overflow-y-auto p-4 space-y-4">
			<!-- Template selector -->
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ __('Template') }}</label>
				<select v-model="selectedTemplate" @change="onTemplateChange"
					class="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-white">
					<option v-for="t in templates" :key="t.name" :value="t.name">{{ t.template_name }}</option>
				</select>
			</div>

			<!-- Fonts -->
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">{{ __('Fonts') }}</label>
				<div class="space-y-2">
					<div>
						<span class="text-[10px] text-gray-500">{{ __('Title') }}</span>
						<select v-model="config.font_header" @change="emitUpdate"
							class="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"
							:style="{ fontFamily: config.font_header }">
							<option v-for="f in fontOptions" :key="f" :value="f" :style="{ fontFamily: f }">{{ f }}</option>
						</select>
					</div>
					<div>
						<span class="text-[10px] text-gray-500">{{ __('Body') }}</span>
						<select v-model="config.font_body" @change="emitUpdate"
							class="w-full px-2 py-1.5 border rounded-lg text-sm bg-white"
							:style="{ fontFamily: config.font_body }">
							<option v-for="f in fontOptions" :key="f" :value="f" :style="{ fontFamily: f }">{{ f }}</option>
						</select>
					</div>
				</div>
			</div>

			<!-- Display toggles -->
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">{{ __('Display') }}</label>
				<div class="space-y-2">
					<label class="flex items-center gap-2 text-sm cursor-pointer">
						<input type="checkbox" v-model="config.show_header" class="rounded" @change="emitUpdate" />
						{{ __('Header / Title') }}
					</label>
					<label class="flex items-center gap-2 text-sm cursor-pointer">
						<input type="checkbox" v-model="config.show_descriptions" class="rounded" @change="emitUpdate" />
						{{ __('Descriptions') }}
					</label>
					<label class="flex items-center gap-2 text-sm cursor-pointer">
						<input type="checkbox" v-model="config.show_allergens" class="rounded" @change="emitUpdate" />
						{{ __('Allergens & Badges') }}
					</label>
					<label class="flex items-center gap-2 text-sm cursor-pointer">
						<input type="checkbox" v-model="config.show_options" class="rounded" @change="onToggleOptions" />
						{{ __('Product Options') }}
					</label>
					<!-- Option group selector -->
					<div v-if="config.show_options && availableOptionGroups.length > 0" class="ml-6 mt-1 space-y-1">
						<label v-for="group in availableOptionGroups" :key="group"
							class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
							<input type="checkbox" :value="group" v-model="selectedOptionGroups" class="rounded"
								@change="emitUpdate" />
							{{ group }}
						</label>
					</div>
					<label class="flex items-center gap-2 text-sm cursor-pointer">
						<input type="checkbox" v-model="config.show_images" class="rounded" @change="emitUpdate" />
						{{ __('Item Images') }}
					</label>
				</div>
			</div>

			<!-- Price alignment -->
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">{{ __('Price Alignment') }}</label>
				<div class="flex gap-1">
					<button v-for="opt in ['right', 'inline', 'dotted']" :key="opt"
						@click="config.price_alignment = opt; emitUpdate()"
						class="px-3 py-1.5 text-xs rounded-lg border transition-colors capitalize"
						:class="config.price_alignment === opt ? 'bg-purple-100 border-purple-400 text-purple-700' : 'border-gray-200 hover:border-gray-300'">
						{{ __(opt) }}
					</button>
				</div>
			</div>

			<!-- Columns -->
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">{{ __('Columns') }}</label>
				<div class="flex gap-1">
					<button v-for="n in 3" :key="n"
						@click="config.columns = n; emitUpdate()"
						class="w-10 h-8 text-xs rounded-lg border transition-colors"
						:class="config.columns === n ? 'bg-purple-100 border-purple-400 text-purple-700' : 'border-gray-200 hover:border-gray-300'">
						{{ n }}
					</button>
				</div>
			</div>

			<!-- Paper format -->
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">{{ __('Paper Format') }}</label>
				<select v-model="config.paper_format" @change="emitUpdate"
					class="w-full px-3 py-2 border rounded-lg text-sm bg-white">
					<option value="A4 Portrait">A4 Portrait</option>
					<option value="A4 Landscape">A4 Landscape</option>
					<option value="A3">A3</option>
					<option value="Custom">{{ __('Custom') }}</option>
				</select>
			</div>

			<!-- Header & Footer text -->
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">{{ __('Header Text') }}</label>
				<input v-model="config.header_text" type="text" class="w-full px-3 py-1.5 border rounded-lg text-sm"
					:placeholder="__('Leave empty to use card name')" @input="emitUpdate" />
			</div>
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">{{ __('Footer Text') }}</label>
				<input v-model="config.footer_text" type="text" class="w-full px-3 py-1.5 border rounded-lg text-sm"
					:placeholder="__('e.g. All our products are fresh')" @input="emitUpdate" />
			</div>

			<!-- Multi-card selector -->
			<div v-if="cards.length > 1">
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">{{ __('Cards to Include') }}</label>
				<div class="space-y-1.5">
					<label v-for="card in cards" :key="card.name" class="flex items-center gap-2 text-sm cursor-pointer">
						<input type="checkbox" :value="card.name" v-model="selectedCards" class="rounded" />
						{{ card.card_name }}
					</label>
				</div>
			</div>

			<!-- Cover page toggle -->
			<div>
				<label class="flex items-center gap-2 text-sm cursor-pointer">
					<input type="checkbox" :checked="showCoverPage" @change="$emit('update:cover-page', $event.target.checked)" class="rounded" />
					{{ __('Cover page with logo') }}
				</label>
			</div>
		</div>

		<!-- Action buttons -->
		<div class="px-4 py-3 border-t flex-shrink-0 space-y-2">
			<button
				@click="$emit('save-design')"
				:disabled="saveStatus === 'saving'"
				class="w-full px-4 py-2 text-sm font-medium rounded-lg transition-colors"
				:class="saveStatusClass"
			>
				{{ saveLabel }}
			</button>
			<button
				@click="generatePdf"
				:disabled="pdfStatus === 'generating'"
				class="w-full px-4 py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
				:class="pdfButtonClass"
			>
				<div v-if="pdfStatus === 'generating'" class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
				<svg v-else-if="pdfStatus === 'done'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
				<svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				{{ pdfLabel }}
			</button>
		</div>
	</div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeMount } from "vue"

const fontOptions = [
	"Inter",
	"Montserrat",
	"Playfair Display",
	"Forum",
	"Lora",
	"Merriweather",
	"Cormorant Garamond",
	"Libre Baskerville",
	"Raleway",
	"Oswald",
	"Cinzel",
	"Source Sans 3",
	"Nunito",
	"Caveat",
	"Dancing Script",
]

const props = defineProps({
	templates: { type: Array, default: () => [] },
	currentTemplate: { type: Object, default: () => ({}) },
	cardName: { type: String, default: "" },
	cards: { type: Array, default: () => [] },
	showCoverPage: { type: Boolean, default: true },
	saveStatus: { type: String, default: null },
	pdfStatus: { type: String, default: null },
})

const emit = defineEmits([
	"update:config",
	"generate-pdf",
	"save-design",
	"update:cover-page",
])

const selectedTemplate = ref("")
const selectedCards = ref([])
const selectedOptionGroups = ref([])

// Extract available option groups from preview data (all selected cards)
const availableOptionGroups = computed(() => {
	const groups = new Set()
	const tpl = props.currentTemplate
	if (tpl?.option_groups) {
		tpl.option_groups.forEach((g) => groups.add(g))
	}
	// Also include groups from extra_option_groups (from additional cards)
	if (tpl?.extra_option_groups) {
		tpl.extra_option_groups.forEach((g) => groups.add(g))
	}
	return [...groups].sort()
})

function onToggleOptions() {
	// When toggling ON, keep existing selection (don't auto-select all)
	emitUpdate()
}

const saveLabel = computed(() => {
	if (props.saveStatus === "saving") return __("Saving...")
	if (props.saveStatus === "saved") return __("Saved!")
	if (props.saveStatus === "error") return __("Error!")
	return __("Save Settings")
})

const saveStatusClass = computed(() => {
	if (props.saveStatus === "saved") return "bg-green-100 text-green-700 border border-green-300"
	if (props.saveStatus === "error") return "bg-red-100 text-red-700 border border-red-300"
	if (props.saveStatus === "saving") return "bg-gray-200 text-gray-500"
	return "bg-gray-100 text-gray-700 hover:bg-gray-200"
})

const pdfLabel = computed(() => {
	if (props.pdfStatus === "generating") return __("Generating...")
	if (props.pdfStatus === "done") return __("PDF Downloaded!")
	if (props.pdfStatus === "error") return __("Error!")
	return __("Generate PDF")
})

const pdfButtonClass = computed(() => {
	if (props.pdfStatus === "generating") return "bg-purple-600 opacity-70"
	if (props.pdfStatus === "done") return "bg-green-600 hover:bg-green-700"
	if (props.pdfStatus === "error") return "bg-red-600 hover:bg-red-700"
	return "bg-purple-600 hover:bg-purple-700"
})

const config = reactive({
	font_header: "Montserrat",
	font_body: "Inter",
	show_header: true,
	show_descriptions: true,
	show_allergens: true,
	show_options: false,
	show_images: false,
	price_alignment: "right",
	columns: 1,
	paper_format: "A4 Portrait",
	custom_width_mm: 210,
	custom_height_mm: 297,
	header_text: "",
	footer_text: "",
})

// Load Google Fonts for preview in the font selector
onBeforeMount(() => {
	const families = fontOptions.map((f) => f.replace(/ /g, "+")).join("&family=")
	const link = document.createElement("link")
	link.rel = "stylesheet"
	link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`
	document.head.appendChild(link)
})

function onTemplateChange() {
	const tpl = props.templates.find((t) => t.name === selectedTemplate.value)
	if (tpl) {
		Object.assign(config, {
			font_header: tpl.font_header || "Montserrat",
			font_body: tpl.font_body || "Inter",
			show_header: true,
			show_descriptions: !!tpl.show_descriptions,
			show_allergens: !!tpl.show_allergens,
			show_options: !!tpl.show_options,
			show_images: !!tpl.show_images,
			price_alignment: tpl.price_alignment || "right",
			columns: tpl.columns || 1,
			paper_format: tpl.paper_format || "A4 Portrait",
			custom_width_mm: tpl.custom_width_mm || 210,
			custom_height_mm: tpl.custom_height_mm || 297,
			header_text: tpl.header_text || "",
			footer_text: tpl.footer_text || "",
		})
		emitUpdate()
	}
}

function emitUpdate() {
	emit("update:config", {
		template_name: selectedTemplate.value,
		selected_cards: selectedCards.value,
		selected_option_groups: selectedOptionGroups.value,
		...config,
	})
}

function generatePdf() {
	const cardsToGenerate =
		selectedCards.value.length > 1
			? selectedCards.value
			: [props.cardName]
	emit("generate-pdf", {
		card_names: cardsToGenerate,
		template_name: selectedTemplate.value,
		overrides: { ...config },
		paper_format: config.paper_format,
	})
}

// Initialize when templates arrive
let initialized = false

watch(
	() => props.templates?.length,
	(len) => {
		if (initialized || !len) return
		initialized = true

		// Use saved template if available, otherwise default to "Moderne Minimaliste"
		const saved = props.currentTemplate
		const savedName = saved?.name
		const hasSaved = savedName && props.templates.find((t) => t.name === savedName)

		if (hasSaved) {
			selectedTemplate.value = savedName
		} else {
			const modern = props.templates.find((t) => t.style_theme === "modern")
			selectedTemplate.value = modern?.name || props.templates[0]?.name || ""
		}

		if (selectedTemplate.value) {
			// Load template defaults (without emitting yet)
			const tpl = props.templates.find((t) => t.name === selectedTemplate.value)
			if (tpl) {
				Object.assign(config, {
					font_header: tpl.font_header || "Montserrat",
					font_body: tpl.font_body || "Inter",
					show_header: true,
					show_descriptions: !!tpl.show_descriptions,
					show_allergens: !!tpl.show_allergens,
					show_options: !!tpl.show_options,
					show_images: !!tpl.show_images,
					price_alignment: tpl.price_alignment || "right",
					columns: tpl.columns || 1,
					paper_format: tpl.paper_format || "A4 Portrait",
					custom_width_mm: tpl.custom_width_mm || 210,
					custom_height_mm: tpl.custom_height_mm || 297,
					header_text: tpl.header_text || "",
					footer_text: tpl.footer_text || "",
				})
			}
		}

		// Apply saved overrides on top of template defaults
		if (saved) {
			const overrideKeys = [
				"font_header", "font_body", "show_header", "show_descriptions",
				"show_allergens", "show_options", "show_images",
				"price_alignment", "columns", "paper_format",
				"header_text", "footer_text",
			]
			for (const key of overrideKeys) {
				if (saved[key] !== undefined && saved[key] !== null) {
					config[key] = saved[key]
				}
			}
			// Restore selected option groups (default: none selected)
			if (saved.selected_option_groups && Array.isArray(saved.selected_option_groups)) {
				selectedOptionGroups.value = saved.selected_option_groups
			}
		}

		// Emit AFTER all overrides are applied
		emitUpdate()
	},
	{ immediate: true },
)

watch(selectedCards, () => {
	emitUpdate()
})

onMounted(() => {
	if (props.cardName) {
		selectedCards.value = [props.cardName]
	}
})
</script>

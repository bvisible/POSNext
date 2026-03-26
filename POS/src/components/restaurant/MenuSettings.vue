<template>
	<div class="h-full flex flex-col bg-white">
		<!-- Header -->
		<div class="px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-indigo-50 flex-shrink-0">
			<h3 class="font-bold text-sm text-gray-800">{{ __('Menu Settings') }}</h3>
		</div>

		<div class="flex-1 overflow-y-auto p-4 space-y-5">
			<!-- Template selector -->
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ __('Template') }}</label>
				<select v-model="selectedTemplate" @change="onTemplateChange"
					class="mt-1 w-full px-3 py-2 border rounded-lg text-sm bg-white">
					<option v-for="t in templates" :key="t.name" :value="t.name">{{ t.template_name }}</option>
				</select>
			</div>

			<!-- Display toggles -->
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">{{ __('Display') }}</label>
				<div class="space-y-2">
					<label class="flex items-center gap-2 text-sm cursor-pointer">
						<input type="checkbox" v-model="config.show_descriptions" class="rounded" @change="emitUpdate" />
						{{ __('Descriptions') }}
					</label>
					<label class="flex items-center gap-2 text-sm cursor-pointer">
						<input type="checkbox" v-model="config.show_allergens" class="rounded" @change="emitUpdate" />
						{{ __('Allergens & Badges') }}
					</label>
					<label class="flex items-center gap-2 text-sm cursor-pointer">
						<input type="checkbox" v-model="config.show_options" class="rounded" @change="emitUpdate" />
						{{ __('Product Options') }}
					</label>
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
				<div v-if="config.paper_format === 'Custom'" class="flex gap-2 mt-2">
					<input v-model.number="config.custom_width_mm" type="number" class="w-full px-2 py-1 border rounded text-sm" :placeholder="__('Width mm')" @change="emitUpdate" />
					<input v-model.number="config.custom_height_mm" type="number" class="w-full px-2 py-1 border rounded text-sm" :placeholder="__('Height mm')" @change="emitUpdate" />
				</div>
			</div>

			<!-- Header & Footer -->
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">{{ __('Header Text') }}</label>
				<input v-model="config.header_text" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" @change="emitUpdate" />
			</div>
			<div>
				<label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 block">{{ __('Footer Text') }}</label>
				<input v-model="config.footer_text" type="text" class="w-full px-3 py-2 border rounded-lg text-sm" @change="emitUpdate" />
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
				class="w-full px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
			>
				{{ __('Save Settings') }}
			</button>
			<button
				@click="generatePdf"
				:disabled="generating"
				class="w-full px-4 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
			>
				<svg v-if="!generating" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				<div v-else class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
				{{ generating ? __('Generating...') : __('Generate PDF') }}
			</button>
		</div>
	</div>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from "vue"

const props = defineProps({
	templates: { type: Array, default: () => [] },
	currentTemplate: { type: Object, default: () => ({}) },
	cardName: { type: String, default: "" },
	cards: { type: Array, default: () => [] },
	showCoverPage: { type: Boolean, default: true },
})

const emit = defineEmits([
	"update:config",
	"generate-pdf",
	"save-design",
	"update:cover-page",
])

const selectedTemplate = ref("")
const generating = ref(false)
const selectedCards = ref([])

const config = reactive({
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

function onTemplateChange() {
	const tpl = props.templates.find((t) => t.name === selectedTemplate.value)
	if (tpl) {
		Object.assign(config, {
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
		...config,
	})
}

async function generatePdf() {
	generating.value = true
	try {
		const cardsToGenerate =
			selectedCards.value.length > 1 ? selectedCards.value : [props.cardName]
		emit("generate-pdf", {
			card_names: cardsToGenerate,
			template_name: selectedTemplate.value,
			overrides: { ...config },
			paper_format: config.paper_format,
		})
	} finally {
		setTimeout(() => {
			generating.value = false
		}, 2000)
	}
}

// Initialize once when templates are available — no continuous watch to avoid infinite loops
let initialized = false

watch(
	() => props.templates,
	(templates) => {
		if (initialized || !templates?.length) return
		initialized = true

		// Use current template from card if available, otherwise first template
		const initial = props.currentTemplate?.name || templates[0]?.name
		if (initial) {
			selectedTemplate.value = initial
			onTemplateChange()
		}
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

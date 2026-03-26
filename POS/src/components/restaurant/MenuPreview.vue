<template>
	<div class="h-full overflow-auto bg-gray-200 p-4">
		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center h-full">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
		</div>
		<!-- Preview iframe showing the same HTML as the PDF -->
		<div v-else class="flex justify-center">
			<iframe
				ref="previewFrame"
				class="bg-white shadow-xl border-0"
				:style="{ width: '210mm', minHeight: '297mm', height: frameHeight }"
				:srcdoc="htmlContent"
				@load="onFrameLoad"
			></iframe>
		</div>
	</div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue"
import { call } from "@/utils/apiWrapper"

const props = defineProps({
	cardName: { type: String, default: "" },
	templateName: { type: String, default: "" },
	overrides: { type: Object, default: () => ({}) },
	refreshKey: { type: Number, default: 0 },
})

const loading = ref(true)
const htmlContent = ref("")
const previewFrame = ref(null)
const frameHeight = ref("297mm")

async function loadPreview() {
	if (!props.cardName) return
	loading.value = true
	try {
		const result = await call("pos_next.api.menu_pdf.get_menu_preview_html", {
			card_name: props.cardName,
			template_name: props.templateName || "",
			overrides: JSON.stringify(props.overrides || {}),
		})
		htmlContent.value = result || ""
	} catch (e) {
		console.error("[MenuPreview] Failed to load:", e)
		htmlContent.value =
			"<p style='padding:20px;color:red'>Failed to load preview</p>"
	}
	loading.value = false
}

function onFrameLoad() {
	// Auto-resize iframe to content height
	try {
		const doc = previewFrame.value?.contentDocument
		if (doc?.body) {
			const h = doc.body.scrollHeight
			if (h > 100) {
				frameHeight.value = `${h + 40}px`
			}
		}
	} catch (e) {
		// Cross-origin - ignore
	}
}

watch(
	[() => props.cardName, () => props.templateName, () => props.refreshKey],
	() => loadPreview(),
	{ deep: false },
)

onMounted(() => loadPreview())
</script>

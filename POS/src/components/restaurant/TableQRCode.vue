<template>
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="emit('close')">
		<div class="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between px-5 py-4 border-b border-gray-200">
				<div>
					<h2 class="text-lg font-bold text-gray-900">{{ __('QR Code') }}</h2>
					<p class="text-sm text-gray-500">{{ tableName }}</p>
				</div>
				<button
					@click="emit('close')"
					class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
					</svg>
				</button>
			</div>

			<!-- QR Code -->
			<div class="flex flex-col items-center p-6">
				<div v-if="isGenerating" class="flex items-center justify-center w-56 h-56">
					<svg class="w-8 h-8 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
					</svg>
				</div>
				<canvas
					v-else
					ref="qrCanvas"
					class="rounded-lg"
				></canvas>

				<p class="mt-3 text-sm font-semibold text-gray-800 text-center">{{ tableName }}</p>
				<p class="mt-1 text-xs text-gray-400 break-all text-center max-w-xs">{{ url }}</p>
			</div>

			<!-- Actions -->
			<div class="flex gap-3 px-5 pb-5">
				<button
					@click="handlePrint"
					class="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
					</svg>
					{{ __('Print') }}
				</button>
				<button
					@click="emit('close')"
					class="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 active:bg-blue-800 transition-colors"
				>
					{{ __('Close') }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, onMounted, watch } from "vue"
import QRCode from "qrcode"

const props = defineProps({
	token: { type: String, required: true },
	tableName: { type: String, required: true },
	url: { type: String, required: true },
})

const emit = defineEmits(["close"])

const qrCanvas = ref(null)
const isGenerating = ref(true)

async function generateQR() {
	if (!props.url) return
	isGenerating.value = true
	// Wait for canvas to be in DOM
	await new Promise((r) => setTimeout(r, 50))
	if (!qrCanvas.value) return
	try {
		await QRCode.toCanvas(qrCanvas.value, props.url, {
			width: 224,
			margin: 2,
			color: { dark: "#1a1a1a", light: "#ffffff" },
		})
	} finally {
		isGenerating.value = false
	}
}

onMounted(generateQR)
watch(() => props.url, generateQR)

function handlePrint() {
	if (!qrCanvas.value) return
	const dataUrl = qrCanvas.value.toDataURL("image/png")
	const win = window.open("", "_blank")
	if (!win) return
	win.document.write(`
		<!DOCTYPE html>
		<html>
		<head>
			<title>${props.tableName}</title>
			<style>
				body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: sans-serif; }
				img { width: 300px; height: 300px; }
				h2 { margin: 16px 0 4px; font-size: 24px; }
				p { margin: 0; color: #666; font-size: 12px; word-break: break-all; max-width: 320px; text-align: center; }
			</style>
		</head>
		<body>
			<img src="${dataUrl}" alt="QR Code" />
			<h2>${props.tableName}</h2>
			<p>${props.url}</p>
			<script>window.onload = () => { window.print(); window.close(); }<\/script>
		</body>
		</html>
	`)
	win.document.close()
}
</script>

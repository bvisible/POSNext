<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Shows and prints the QR code that -->
	<!-- //// opens /pos/guest/<token> for one table: the entry point of guest self-ordering. -->
	<!-- //// Upstream POSNext has no guest ordering. (3939a848, 2026-03-28 "QR self-ordering and -->
	<!-- //// takeaway web ordering"; 28eff1d9 switches to v-show so the canvas is already in the -->
	<!-- //// DOM when the code is drawn — with v-if it rendered nothing.) The QR button of a table shows this -->
	<!-- //// dialog at once, with no question first, so it says in one line what the code is for (NeoRestau lot 1). -->
	<!-- //// A waiter shows the code on his PHONE to the guests, who scan it: below Tailwind's `sm` the dialog is the -->
	<!-- //// whole screen, the code as large as the width allows (never under 300 px), the table's name large, a "Close" -->
	<!-- //// button in ink within thumb reach, no "Print", and the screen kept awake while the code is shown. On a tablet -->
	<!-- //// and a desktop it keeps its size; its primary button is ink there too, never blue (design system, README 7). -->
	<!-- //// It is the till's overlay, so it sits at z-300 like the others (index.css: dialogs clear the sticky mobile navigation): at -->
	<!-- //// z-50 the sticky header (z-200) and the phone's Items | Cart strip (z-100), in the same stacking context, painted over -->
	<!-- //// the top of the screen and stayed tappable, and a guest's stray touch could leave the till mid-scan. The Back of a phone -->
	<!-- //// closes it instead of leaving the till (composables/useBackClosesDialog). -->
	<div
		class="fixed inset-0 z-[300]"
		:class="isPhone ? 'flex flex-col bg-white' : 'flex items-center justify-center bg-black/60 p-4'"
		data-test="table-qr-dialog"
		:data-layout="isPhone ? 'phone' : 'card'"
		@click.self="emit('close')"
	>
		<div
			class="flex flex-col bg-white"
			:class="
				isPhone
					? 'min-h-0 w-full flex-1 overflow-hidden'
					: 'max-h-full w-full max-w-sm overflow-y-auto rounded-2xl shadow-xl'
			"
			data-test="table-qr-card"
		>
			<!-- Header (a phone has none: the table's name, large, is the title of the screen) -->
			<div v-if="!isPhone" class="flex items-center justify-between px-5 py-4 border-b border-gray-200">
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
			<div
				data-test="table-qr-body"
				class="flex flex-col items-center"
				:class="isPhone ? 'min-h-0 flex-1 overflow-y-auto px-3 py-4' : 'p-6'"
			>
				<!-- my-auto centres the code on a tall screen and lets a short one scroll from the top of it (justify-center would cut the top off) -->
				<div class="my-auto flex w-full flex-col items-center">
					<div v-show="isGenerating" class="flex items-center justify-center" :style="box">
						<svg class="w-8 h-8 text-[#D68A59] animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
						</svg>
					</div>
					<canvas
						v-show="!isGenerating"
						ref="qrCanvas"
						class="rounded-lg"
						data-test="table-qr-canvas"
					></canvas>

					<p
						data-test="table-qr-name"
						class="text-center"
						:class="
							isPhone
								? 'order-first mb-4 max-w-full break-words font-display text-[40px] leading-tight text-[#141414]'
								: 'mt-3 text-sm font-semibold text-gray-800'
						"
					>{{ tableName }}</p>
					<p
						data-test="table-qr-purpose"
						class="max-w-xs text-center"
						:class="isPhone ? 'mt-4 text-[17px] leading-snug text-[#524B41]' : 'mt-1 text-sm text-gray-600'"
					>
						{{ __('Guests scan this code to order from their phone.') }}
					</p>
					<p v-if="!isPhone" class="mt-1 text-xs text-gray-400 break-all text-center max-w-xs">{{ url }}</p>
				</div>
			</div>

			<!-- Actions: "Close" is the primary one, in ink; a phone prints nothing -->
			<div
				class="flex gap-3"
				:class="isPhone ? 'px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]' : 'px-5 pb-5'"
				data-test="table-qr-actions"
			>
				<button
					v-if="!isPhone"
					@click="handlePrint"
					data-test="table-qr-print"
					class="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
					</svg>
					{{ __('Print') }}
				</button>
				<button
					@click="emit('close')"
					data-test="table-qr-close"
					class="flex-1 rounded-xl bg-[#141414] font-medium text-white transition-colors hover:bg-[#2B2B2B] active:bg-black"
					:class="isPhone ? 'min-h-[56px] text-[18px]' : 'min-h-[44px] py-2.5 text-sm'"
				>
					{{ __('Close') }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import QRCode from "qrcode"
import { useBackClosesDialog } from "@/composables/useBackClosesDialog"

const props = defineProps({
	token: { type: String, required: true },
	tableName: { type: String, required: true },
	url: { type: String, required: true },
})

const emit = defineEmits(["close"])

const qrCanvas = ref(null)
const isGenerating = ref(true)

// Below Tailwind's `sm` (640 px) the dialog is the whole screen: a phone held up to a table
const PHONE_BELOW = 640
const viewportWidth = ref(window.innerWidth)
const isPhone = computed(() => viewportWidth.value < PHONE_BELOW)
// The Back of a phone (the Android button, the iOS edge swipe) closes the dialog instead of leaving the till
useBackClosesDialog(isPhone, () => emit("close"))
// The code as large as the width allows, never under 300 px (it is scanned from an arm's length); a tablet and a desktop
// keep the 224 px they always had
const qrSize = computed(() =>
	isPhone.value ? Math.max(300, Math.min(viewportWidth.value - 24, 480)) : 224,
)
const box = computed(() => ({ width: `${qrSize.value}px`, height: `${qrSize.value}px` }))

function measure() {
	viewportWidth.value = window.innerWidth
}

async function generateQR() {
	if (!props.url) return
	isGenerating.value = true
	// Wait for canvas to be in DOM
	await new Promise((r) => setTimeout(r, 50))
	if (!qrCanvas.value) return
	const size = qrSize.value
	try {
		await QRCode.toCanvas(qrCanvas.value, props.url, {
			// Drawn at the screen's own pixel density: a phone has two or three device pixels to a CSS pixel
			width: Math.round(size * (window.devicePixelRatio || 1)),
			// The quiet zone around the code stays, wider on a phone, where the screen can be dark around it
			margin: isPhone.value ? 4 : 2,
			// Ink on white: the highest contrast the design system has
			color: { dark: "#141414", light: "#ffffff" },
		})
		// ... and shown at its size in CSS pixels (the library sets the canvas's style to its pixel size)
		qrCanvas.value.style.width = `${size}px`
		qrCanvas.value.style.height = `${size}px`
	} finally {
		isGenerating.value = false
	}
}

// The screen stays awake while the code is shown, where the Screen Wake Lock API exists; where it does not, or refuses,
// nothing happens (the lock is released by the browser when the page is hidden, and taken again when it is shown)
let wakeLock = null
let closed = false
// A request the browser has not answered yet: the page shown again meanwhile must not ask a second time, or the second lock
// would overwrite the first, which would then outlive the dialog
let asking = false

async function keepAwake() {
	if (asking || wakeLock || closed) return
	try {
		if (!navigator.wakeLock?.request) return
		asking = true
		const lock = await navigator.wakeLock.request("screen")
		if (closed) {
			// The dialog was closed while the browser was granting it
			releaseLock(lock)
			return
		}
		wakeLock = lock
		// The browser releases the lock itself when the page is hidden: forget it, so that it is taken again on return
		lock.addEventListener?.("release", () => {
			if (wakeLock === lock) wakeLock = null
		})
	} catch {
		wakeLock = null
	} finally {
		asking = false
	}
}

function releaseLock(lock) {
	try {
		Promise.resolve(lock?.release?.()).catch(() => {})
	} catch {
		// Nothing to do: the lock goes with the page anyway
	}
}

function onVisibilityChange() {
	if (document.visibilityState === "visible") keepAwake()
}

onMounted(() => {
	generateQR()
	window.addEventListener("resize", measure)
	window.addEventListener("orientationchange", measure)
	document.addEventListener("visibilitychange", onVisibilityChange)
	keepAwake()
})

onBeforeUnmount(() => {
	closed = true
	window.removeEventListener("resize", measure)
	window.removeEventListener("orientationchange", measure)
	document.removeEventListener("visibilitychange", onVisibilityChange)
	releaseLock(wakeLock)
	wakeLock = null
})

watch([() => props.url, qrSize], generateQR)

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

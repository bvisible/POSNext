<template>
	<!-- //// Neoffice — the panel is no longer the whole screen (Daniel, 01.11: « un pop-up un tout petit peu plus petit […] la hauteur, il faut l'avoir, mais la largeur, on peut faire quelque chose de plus sympa »): it is as high as the ticket needs, up to the screen, and as wide as one column of dishes (the card sets its width), centred over the board; a very long ticket scrolls up and down inside it. -->
	<!-- //// Neoffice — added file (no upstream equivalent). A ticket opened FULL SCREEN over the board (NeoResto lot 1, task 38a-3, ruling 107 layer 3: « on force par-dessus »). -->
	<!-- //// The long ticket of a busy service does not fit its card, even wide, so the cook opens it: the same ticket, the same buttons, in a panel that takes the screen, over the board that keeps -->
	<!-- //// updating behind it. This is only the SHELL (the scrim, the dialog, the way out); what is inside is the card itself, drawn in its full-screen form by the card that opened it. It is -->
	<!-- //// closed by the × of the card, by a tap on the scrim around it, and by Escape. The focus is kept inside it while it is open and goes back where it was when it closes. It is -->
	<!-- //// teleported to the page's body so that no scrolling lane, snap point or stacking context of the board can cut it, and it sits under the undo toast (z-40 against z-50): a dish made ready -->
	<!-- //// from the panel offers its five seconds to take it back, and the toast must be seen. The scrim is the design system's overlay (`--surface-overlay`: ink at 55 %, black at 66 % in dark). -->
	<Teleport to="body">
		<div
			data-test="fullscreen-scrim"
			class="fixed inset-x-0 top-0 z-40 flex h-screen items-center justify-center bg-[rgba(24,20,16,0.55)] p-3.5 supports-[height:100dvh]:h-dvh dark:bg-[rgba(0,0,0,0.66)]"
			@click.self="emit('close')"
		>
			<div
				ref="dialogEl"
				data-test="ticket-fullscreen"
				role="dialog"
				aria-modal="true"
				:aria-label="label || undefined"
				tabindex="-1"
				class="flex max-h-full min-h-0 min-w-0 flex-1 justify-center outline-none"
				@keydown="onKeydown"
			>
				<slot />
			</div>
		</div>
	</Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue"

/**
 * label: what the dialog is called for a screen reader (the table, or « Takeaway »)
 * Says `close` when the cook taps outside the panel or presses Escape; the card inside says it for its own ×.
 */
defineProps({
	label: { type: String, default: "" },
})
const emit = defineEmits(["close"])

const dialogEl = ref(null)
// Where the focus was when the panel opened (the strip that opened it), to put it back there when it closes
let openedFrom = null

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const focusable = () =>
	[...(dialogEl.value?.querySelectorAll(FOCUSABLE) || [])].filter(
		(element) => element.getAttribute("aria-hidden") !== "true",
	)

// Tab goes round inside the panel: from the last control to the first, and Shift+Tab from the first (or from the panel itself) to the last
function onKeydown(event) {
	if (event.key !== "Tab") return
	const controls = focusable()
	if (!controls.length) {
		event.preventDefault()
		dialogEl.value?.focus()
		return
	}
	const first = controls[0]
	const last = controls[controls.length - 1]
	const active = document.activeElement
	if (event.shiftKey && (active === first || active === dialogEl.value)) {
		event.preventDefault()
		last.focus()
	} else if (!event.shiftKey && active === last) {
		event.preventDefault()
		first.focus()
	}
}

// Escape closes, wherever the focus is; and the focus never leaves the panel (a tap on the scrim, a control of the board behind it)
function onEscape(event) {
	if (event.key === "Escape") {
		event.stopPropagation()
		emit("close")
	}
}
function keepFocusInside(event) {
	if (dialogEl.value && !dialogEl.value.contains(event.target))
		dialogEl.value.focus()
}

onMounted(() => {
	openedFrom = document.activeElement
	document.addEventListener("keydown", onEscape)
	document.addEventListener("focusin", keepFocusInside)
	nextTick(() => dialogEl.value?.focus())
})
onBeforeUnmount(() => {
	document.removeEventListener("keydown", onEscape)
	document.removeEventListener("focusin", keepFocusInside)
	// The ticket may have left the board meanwhile (it was delivered from the panel): the strip is gone then, and there is nowhere to go back to
	if (openedFrom?.isConnected) openedFrom.focus?.()
})
</script>

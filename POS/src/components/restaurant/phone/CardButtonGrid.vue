<!-- //// Neoffice — added file (no upstream equivalent). The restaurant card as buttons, as the waiter mockup draws it -->
<!-- //// (NeoRestau lot 1, task 27; design § G: « the card as buttons, not a list; no pictures by default; three -->
<!-- //// buttons per row; one colour per type; touch = +1, long press = options; the count already ordered; sold -->
<!-- //// out »). Each button: the name (two lines at most), the price under it, a top border and a soft -->
<!-- //// background in its colour, the count already in the order as an ink pill, struck and shut when the dish cannot -->
<!-- //// be sold. A touch is +1 and a long press the options; a press that scrolls the card is neither -->
<!-- //// (usePressGesture). The tablet's two columns (design § G) can take the same buttons later. -->
<template>
	<div
		data-card-grid
		class="grid gap-1.5 content-start"
		:style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
	>
		<button
			v-for="button in buttons"
			:key="button.key"
			type="button"
			data-card-button
			:disabled="button.soldOut"
			:class="['card-button', button.soldOut ? 'card-button--sold-out' : '']"
			:style="button.soldOut ? null : faceOf(button)"
			@pointerdown="gesture.down(button, $event)"
			@pointermove="gesture.move($event)"
			@pointerup="gesture.up($event)"
			@pointercancel="gesture.cancel()"
			@pointerleave="gesture.leave()"
			@click="gesture.click(button, $event)"
			@contextmenu="gesture.contextmenu(button, $event)"
		>
			<img
				v-if="pictures && button.image && !button.soldOut"
				data-button-image
				:src="button.image"
				alt=""
				loading="lazy"
				draggable="false"
				class="card-button__image"
			/>
			<span data-button-name :class="['card-button__name', button.count > 0 ? 'card-button__name--counted' : '']">
				<s v-if="button.soldOut">{{ button.name }}</s>
				<template v-else>{{ button.name }}</template>
			</span>
			<span v-if="button.soldOut" data-sold-out class="card-button__sold-out">{{ __("Sold out") }}</span>
			<span v-else data-button-price class="card-button__price"
				>{{ button.price }}<template v-if="button.detail"> · {{ button.detail }}</template></span
			>
			<span v-if="button.count > 0" data-button-count class="card-button__count">{{
				formatCount(button.count)
			}}</span>
		</button>
	</div>
</template>

<script setup>
import { usePressGesture } from "@/composables/usePressGesture"
import { NEUTRAL_EDGE, NEUTRAL_FACE, formatCount, softTint } from "@/utils/phoneCard"

defineProps({
	// The buttons to show: { key, entry, name, price, detail, color, count, soldOut, image }
	buttons: { type: Array, default: () => [] },
	// The till's « with pictures »: a dish's picture above its name
	pictures: { type: Boolean, default: false },
	// Buttons per row: three on a phone (design § G)
	columns: { type: Number, default: 3 },
})

const emit = defineEmits(["tap", "press"])

// A dish that cannot be sold answers nothing, whatever reaches its button (some browsers still send pointer events to a
// disabled button)
const gesture = usePressGesture({
	onTap: (button) => button.soldOut || emit("tap", button),
	onLongPress: (button) => button.soldOut || emit("press", button),
})

function faceOf(button) {
	return button.color
		? { borderTopColor: button.color, backgroundColor: softTint(button.color) }
		: { borderTopColor: NEUTRAL_EDGE, backgroundColor: NEUTRAL_FACE }
}
</script>

<style scoped>
/* The waiter mockup's button: 64 px at least, 10 px corners, a 4 px top border in the type's colour */
.card-button {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 2px;
	min-height: 64px;
	padding: 6px 8px;
	border: 0;
	border-top: 4px solid;
	border-radius: 10px;
	color: #141414;
	font-size: 14px;
	font-weight: 600;
	line-height: 1.25;
	text-align: start;
	/* A long press must neither select text nor raise the phone's own menu; a touch must not wait for a double tap */
	touch-action: manipulation;
	user-select: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
	-webkit-tap-highlight-color: transparent;
	transition:
		transform 120ms ease,
		filter 120ms ease;
}

.card-button:active:not(:disabled) {
	transform: scale(0.98);
	filter: brightness(0.96);
}

.card-button:focus-visible {
	outline: 2px solid #141414;
	outline-offset: 2px;
}

.card-button__image {
	width: 100%;
	height: 64px;
	margin-bottom: 2px;
	border-radius: 6px;
	object-fit: cover;
	pointer-events: none;
}

.card-button__name {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
	overflow-wrap: anywhere;
	hyphens: auto;
}

/* Clear of the pill at the top right */
.card-button__name--counted {
	padding-inline-end: 22px;
}

.card-button__price {
	font-size: 12px;
	font-weight: 400;
}

.card-button__count {
	position: absolute;
	top: 4px;
	inset-inline-end: 6px;
	padding: 0 7px;
	border-radius: 10px;
	background: #141414;
	color: #fffdf8;
	font-size: 12px;
	font-weight: 600;
	line-height: 18px;
}

/* A dish that cannot be sold: dashed sand, struck, « Sold out » in red */
.card-button--sold-out {
	border: 1px dashed #bfb5a4;
	background: #f6f3ed;
	color: #6f665a;
	cursor: not-allowed;
}

.card-button__sold-out {
	color: #c1372c;
	font-size: 12px;
	font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
	.card-button {
		transition: none;
	}
}
</style>

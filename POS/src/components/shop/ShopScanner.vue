<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The scanner of a customer in the shop (lot 2, board 2 of the -->
	<!-- //// canvas): the back camera reads the labels (utils/barcodeReader), the code can always be typed, and the last -->
	<!-- //// article added, or the reason an article was refused, is said under the camera. -->
	<section class="shop-scanner">
		<div class="shop-scanner__camera">
			<video ref="video" class="shop-scanner__video" playsinline muted autoplay></video>
			<div v-if="camera === 'live'" class="shop-scanner__frame" aria-hidden="true">
				<span class="shop-scanner__line"></span>
			</div>
			<p v-if="camera === 'starting'" class="shop-scanner__caption">
				{{ __("Opening the camera…") }}
			</p>
			<p v-else-if="camera === 'live'" class="shop-scanner__caption">
				{{ __("Aim at the article's barcode") }}
			</p>
			<p v-else class="shop-scanner__caption">
				{{ __("The camera is not available here. Type the barcode below.") }}
			</p>
		</div>

		<form class="shop-scanner__typed" @submit.prevent="typed">
			<label class="shop-scanner__label" for="shop-barcode">{{
				__("Type the barcode")
			}}</label>
			<div class="shop-scanner__field">
				<input
					id="shop-barcode"
					v-model.trim="code"
					class="shop-scanner__input"
					type="text"
					inputmode="numeric"
					autocomplete="off"
					:disabled="busy"
				/>
				<button
					type="submit"
					class="shop-button shop-button--ink shop-button--small"
					:disabled="busy || !code"
				>
					{{ __("Add") }}
				</button>
			</div>
		</form>

		<p v-if="message" class="shop-scanner__refused" role="alert">{{ message }}</p>

		<div v-if="added" class="shop-scanner__added" role="status">
			<p class="shop-scanner__added-title">{{ __("Added to your cart") }}</p>
			<p class="shop-scanner__added-name">{{ added.item_name }}</p>
			<p class="shop-scanner__added-price">
				<s v-if="added.rate < added.price_list_rate">{{ money(added.price_list_rate) }}</s>
				<strong>{{ money(added.rate) }}</strong>
				<span>× {{ added.qty }}</span>
			</p>
		</div>

		<div class="shop-scanner__actions">
			<button
				type="button"
				class="shop-button shop-button--ink"
				:disabled="busy"
				@click="emit('cart')"
			>
				{{ __("See my cart") }}
			</button>
		</div>
	</section>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { startReader } from "@/utils/barcodeReader";
import { formatAmount } from "@/utils/shopScan";

const props = defineProps({
	busy: { type: Boolean, default: false },
	// The line of the article added last ({item_name, qty, rate, price_list_rate}), else null
	added: { type: Object, default: null },
	// Why the last code was refused, in the server's words
	message: { type: String, default: "" },
	currency: { type: String, default: "" },
});
const emit = defineEmits(["code", "cart"]);

const video = ref(null);
// starting | live | none
const camera = ref("starting");
const code = ref("");
let reader = null;

function money(amount) {
	return formatAmount(amount, props.currency);
}

function typed() {
	if (!code.value) return;
	emit("code", code.value);
	code.value = "";
}

onMounted(async () => {
	try {
		reader = await startReader(video.value, (text) => emit("code", text));
		camera.value = "live";
	} catch {
		// Refused, no camera, an insecure page: the code is typed
		camera.value = "none";
	}
});

onBeforeUnmount(() => {
	if (reader) reader.stop();
	reader = null;
});
</script>

<style scoped>
.shop-scanner {
	display: flex;
	flex-direction: column;
	gap: 14px;
}
.shop-scanner__camera {
	position: relative;
	display: grid;
	place-items: center;
	min-height: 300px;
	overflow: hidden;
	/* A neutral dark behind the camera, as the rest of the page (05.11.2026): no warm sand */
	background: linear-gradient(160deg, #383838, #171717);
	border-radius: 16px;
}
.shop-scanner__video {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.shop-scanner__frame {
	position: relative;
	width: 250px;
	height: 150px;
	border: 4px solid rgba(255, 255, 255, 0.9);
	border-radius: 14px;
}
.shop-scanner__line {
	position: absolute;
	left: 14px;
	right: 14px;
	top: 50%;
	height: 2px;
	background: #ffffff;
}
.shop-scanner__caption {
	position: absolute;
	left: 16px;
	right: 16px;
	bottom: 14px;
	margin: 0;
	text-align: center;
	font-size: 14px;
	line-height: 20px;
	color: #f3f3f3;
}
.shop-scanner__typed {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.shop-scanner__label {
	font-size: 13px;
	font-weight: 600;
	color: var(--ink-muted);
}
.shop-scanner__field {
	display: flex;
	gap: 8px;
}
.shop-scanner__input {
	flex: 1;
	min-width: 0;
	height: 48px;
	box-sizing: border-box;
	padding: 0 14px;
	font: inherit;
	font-size: 16px;
	color: var(--ink);
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 14px;
}
.shop-scanner__refused {
	margin: 0;
	padding: 12px 14px;
	font-size: 14px;
	line-height: 20px;
	color: var(--danger-ink);
	background: var(--danger-soft);
	border-radius: 12px;
}
.shop-scanner__added {
	padding: 14px 16px;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 18px;
}
.shop-scanner__added-title {
	margin: 0;
	font-size: 13px;
	font-weight: 700;
	color: var(--success-ink);
}
.shop-scanner__added-name {
	margin: 4px 0 0;
	font-size: 15px;
	font-weight: 600;
	color: var(--ink);
	overflow-wrap: anywhere;
}
.shop-scanner__added-price {
	display: flex;
	gap: 8px;
	align-items: baseline;
	margin: 4px 0 0;
	font-size: 14px;
	font-variant-numeric: tabular-nums;
}
.shop-scanner__added-price s {
	color: var(--ink-dim);
}
.shop-scanner__added-price strong {
	color: var(--signal-text);
}
.shop-scanner__added-price span {
	color: var(--ink-muted);
}
.shop-scanner__actions {
	display: flex;
	flex-direction: column;
}
</style>

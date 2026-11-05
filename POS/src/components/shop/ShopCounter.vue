<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The cart that waits for the till (lot 2, board 4 of the -->
	<!-- //// canvas): its code in large type and as a QR code the seller's scanner reads, the amount the till takes. -->
	<!-- //// Paid on the phone (lot 4, board 5), it waits for its check at the reception, by the same code; once the seller -->
	<!-- //// checked it, the page says so. While it waits for the till, the customer may still pay it here (« Pay now »). -->
	<section class="shop-counter">
		<p :class="['shop-counter__pill', `shop-counter__pill--${stage}`]">
			<span aria-hidden="true"></span>{{ pill }}
		</p>
		<h1 class="shop-counter__title">{{ title }}</h1>
		<p v-if="stage === 'paid'" class="shop-counter__lede">
			{{ __("Your payment is received.") }}
			{{ __("Before you leave, show this code: a seller checks your articles.") }}
		</p>
		<p v-else-if="stage === 'checked'" class="shop-counter__lede">
			{{ __("Thank you for your visit.") }}
		</p>

		<div class="shop-counter__card">
			<!-- eslint-disable-next-line vue/no-v-html -- an SVG the qrcode library draws from the cart's own code -->
			<div
				v-if="qr && stage !== 'checked'"
				class="shop-counter__qr"
				role="img"
				:aria-label="__('QR code of your cart')"
				v-html="qr"
			></div>
			<p class="shop-counter__code">{{ cart.code }}</p>
			<p class="shop-counter__summary">
				{{ articlesLabel(articles) }} ·
				<strong>{{ money(amountDue(cart)) }}</strong>
			</p>
		</div>

		<template v-if="stage === 'waiting'">
			<!-- Short sentences: the extractor of the translations does not read a __() whose text opens on the next line -->
			<p class="shop-counter__lede">
				{{ __("The seller scans this code and takes your cart over.") }}
				{{ __("Once it is checked, you pay {0}.", [amount]) }}
			</p>
			<p v-if="cart.needs_validation" class="shop-counter__notice" role="note">
				{{ __("A seller checks an article of your cart at the counter.") }}
			</p>
			<button
				v-if="cart.can_pay"
				type="button"
				class="shop-button shop-button--ink"
				:disabled="busy"
				@click="emit('pay')"
			>
				{{ __("Pay now") }}
			</button>
		</template>
		<p v-else-if="stage === 'paid'" class="shop-counter__fine">
			{{ __("The payment counts once the provider has confirmed it.") }}
		</p>
	</section>
</template>

<script setup>
import QRCode from "qrcode";
import { computed, ref, watchEffect } from "vue";
import { amountDue, articlesIn, articlesLabel, formatAmount } from "@/utils/shopScan";

const props = defineProps({
	cart: { type: Object, required: true },
	busy: { type: Boolean, default: false },
});
const emit = defineEmits(["pay"]);

// Where the cart stands: waiting for the till, paid on the phone (waiting for its check), checked by the seller
const stage = computed(() =>
	props.cart?.status === "Checked" ? "checked" : props.cart?.status === "Paid" ? "paid" : "waiting",
);
const pill = computed(() => {
	if (stage.value === "checked") return __("Validated");
	if (stage.value === "paid") return __("Paid · {0}", [money(props.cart?.paid_amount)]);
	return __("Waiting for the till");
});
const title = computed(() => {
	if (stage.value === "checked") return __("Your cart is validated");
	if (stage.value === "paid") return __("Go to the reception to have your cart validated");
	return __("Show this code to the seller");
});

const qr = ref("");
const articles = computed(() => articlesIn(props.cart));
const amount = computed(() => money(amountDue(props.cart)));

function money(value) {
	return formatAmount(value, props.cart?.currency);
}

watchEffect(async () => {
	const code = props.cart?.code;
	qr.value = code
		? await QRCode.toString(code, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
		: "";
});
</script>

<style scoped>
.shop-counter {
	display: flex;
	flex-direction: column;
	gap: 16px;
}
.shop-counter__pill {
	display: inline-flex;
	align-self: flex-start;
	align-items: center;
	gap: 6px;
	margin: 0;
	padding: 3px 9px;
	font-size: 11px;
	font-weight: 600;
	color: var(--signal-text);
	background: var(--signal-soft);
	border-radius: 999px;
}
.shop-counter__pill--paid,
.shop-counter__pill--checked {
	color: var(--success-ink);
	background: var(--success-soft, #e9f7ee);
}
/* The base rule of the dot below comes later: a paid or checked dot outranks it */
.shop-counter__pill.shop-counter__pill--paid span,
.shop-counter__pill.shop-counter__pill--checked span {
	background: #1f9d57;
}
.shop-counter__fine {
	margin: 0;
	font-size: 12px;
	text-align: center;
	color: var(--ink-dim);
}
.shop-counter__pill span {
	width: 6px;
	height: 6px;
	background: var(--signal);
	border-radius: 999px;
}
.shop-counter__title {
	margin: 0;
	font-size: 22px;
	font-weight: 700;
	line-height: 28px;
	color: var(--ink);
}
.shop-counter__card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 14px;
	padding: 22px;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 18px;
}
.shop-counter__qr {
	width: 200px;
	height: 200px;
}
.shop-counter__qr :deep(svg) {
	width: 100%;
	height: 100%;
}
.shop-counter__code {
	margin: 0;
	font-family: ui-monospace, "SF Mono", Menlo, monospace;
	font-size: 40px;
	font-weight: 700;
	letter-spacing: 0.12em;
	color: var(--ink);
}
.shop-counter__summary {
	margin: 0;
	font-size: 14px;
	color: var(--ink-muted);
}
.shop-counter__summary strong {
	color: var(--ink);
}
.shop-counter__lede {
	margin: 0;
	font-size: 15px;
	line-height: 22px;
	color: var(--ink-muted);
}
.shop-counter__notice {
	margin: 0;
	padding: 12px 14px;
	font-size: 14px;
	line-height: 20px;
	color: var(--warning-ink);
	background: var(--warning-soft);
	border-radius: 12px;
}
</style>

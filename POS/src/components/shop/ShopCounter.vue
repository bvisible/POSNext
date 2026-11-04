<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The cart that waits for the till (lot 2, board 4 of the -->
	<!-- //// canvas): its code in large type and as a QR code the seller's scanner reads, the amount the till takes. -->
	<section class="shop-counter">
		<p class="shop-counter__pill">
			<span aria-hidden="true"></span>{{ __("Waiting for the till") }}
		</p>
		<h1 class="shop-counter__title">{{ __("Show this code to the seller") }}</h1>

		<div class="shop-counter__card">
			<!-- eslint-disable-next-line vue/no-v-html -- an SVG the qrcode library draws from the cart's own code -->
			<div
				v-if="qr"
				class="shop-counter__qr"
				role="img"
				:aria-label="__('QR code of your cart')"
				v-html="qr"
			></div>
			<p class="shop-counter__code">{{ cart.code }}</p>
			<p class="shop-counter__summary">
				{{ __("{0} articles", [articles]) }} ·
				<strong>{{ money(cart.grand_total) }}</strong>
			</p>
		</div>

		<!-- Short sentences: the extractor of the translations does not read a __() whose text opens on the next line -->
		<p class="shop-counter__lede">
			{{ __("The seller scans this code and takes your cart over.") }}
			{{ __("Once it is checked, you pay {0}.", [amount]) }}
		</p>
		<p v-if="cart.needs_validation" class="shop-counter__notice" role="note">
			{{ __("A seller checks an article of your cart at the counter.") }}
		</p>
	</section>
</template>

<script setup>
import QRCode from "qrcode";
import { computed, ref, watchEffect } from "vue";
import { articlesIn, formatAmount } from "@/utils/shopScan";

const props = defineProps({
	cart: { type: Object, required: true },
});

const qr = ref("");
const articles = computed(() => articlesIn(props.cart));
const amount = computed(() => money(props.cart?.grand_total));

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
.shop-counter__pill span {
	width: 6px;
	height: 6px;
	background: var(--signal);
	border-radius: 999px;
}
.shop-counter__title {
	margin: 0;
	font-family: "Forum", serif;
	font-size: 32px;
	font-weight: 400;
	line-height: 36px;
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

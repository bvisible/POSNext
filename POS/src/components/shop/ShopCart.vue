<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The cart of a customer scanning in the shop (lot 2, board 3 of -->
	<!-- //// the canvas): its lines with their quantity, the till's offers, and the amount the till takes, to the centime. -->
	<section class="shop-cart" :aria-busy="busy">
		<p v-if="!lines.length" class="shop-cart__empty">{{ __("Your cart is empty.") }}</p>

		<ul v-else class="shop-cart__lines">
			<li v-for="line in lines" :key="line.line" class="shop-line">
				<img
					v-if="line.image"
					class="shop-line__photo"
					:src="line.image"
					alt=""
					loading="lazy"
				/>
				<span v-else class="shop-line__photo" aria-hidden="true"></span>
				<div class="shop-line__body">
					<p class="shop-line__name">{{ line.item_name }}</p>
					<p v-if="line.is_free_item" class="shop-line__offer">{{ __("Offered") }}</p>
					<p v-else-if="isDiscounted(line)" class="shop-line__offer">
						{{ __("Offer −{0} %", [Math.round(line.discount_percentage)]) }}
					</p>
					<p v-else class="shop-line__unit">{{ __("{0} each", [money(line.rate)]) }}</p>
					<p v-if="line.needs_validation" class="shop-line__check">
						{{ __("Checked by a seller") }}
					</p>
				</div>
				<div v-if="!line.is_free_item" class="shop-stepper">
					<button
						type="button"
						class="shop-stepper__button"
						:disabled="busy"
						:aria-label="__('One less {0}', [line.item_name])"
						@click="emit('qty', line.line, line.qty - 1)"
					>
						−
					</button>
					<span class="shop-stepper__qty" aria-live="polite">{{ line.qty }}</span>
					<button
						type="button"
						class="shop-stepper__button"
						:disabled="busy || line.qty >= 999"
						:aria-label="__('One more {0}', [line.item_name])"
						@click="emit('qty', line.line, line.qty + 1)"
					>
						+
					</button>
				</div>
				<span v-else class="shop-line__free-qty">× {{ line.qty }}</span>
				<p class="shop-line__amount">
					<s v-if="isDiscounted(line)" class="shop-line__was">{{
						money(line.price_list_rate * line.qty)
					}}</s>
					<strong>{{ money(line.amount) }}</strong>
				</p>
			</li>
		</ul>

		<div v-if="lines.length" class="shop-cart__totals">
			<p class="shop-cart__row">
				<span>{{ __("Subtotal") }}</span
				><span>{{ money(cart.total) }}</span>
			</p>
			<p v-if="cart.discount > 0" class="shop-cart__row shop-cart__row--offer">
				<span>{{ __("The till's offers") }}</span
				><span>− {{ money(cart.discount) }}</span>
			</p>
		</div>

		<p v-if="cart.needs_validation" class="shop-cart__notice" role="note">
			{{ __("A seller checks an article of your cart at the counter.") }}
		</p>

		<div class="shop-cart__band">
			<div>
				<p class="shop-cart__band-title">{{ __("You will pay") }}</p>
				<p class="shop-cart__band-hint">{{ __("the same amount at the till") }}</p>
			</div>
			<p class="shop-cart__band-amount">{{ money(cart.grand_total) }}</p>
		</div>

		<div class="shop-cart__actions">
			<button
				type="button"
				class="shop-button shop-button--ink"
				:disabled="busy || !lines.length"
				@click="emit('finish')"
			>
				{{ __("I pay at the till") }}
			</button>
			<button
				type="button"
				class="shop-button shop-button--line"
				:disabled="busy"
				@click="emit('scan')"
			>
				{{ __("Scan an article") }}
			</button>
		</div>
	</section>
</template>

<script setup>
import { computed } from "vue";
import { formatAmount } from "@/utils/shopScan";

const props = defineProps({
	cart: { type: Object, required: true },
	busy: { type: Boolean, default: false },
});
const emit = defineEmits(["qty", "scan", "finish"]);

const lines = computed(() => props.cart?.lines || []);

function money(amount) {
	return formatAmount(amount, props.cart?.currency);
}

function isDiscounted(line) {
	return !line.is_free_item && line.discount_percentage > 0 && line.rate < line.price_list_rate;
}

defineExpose({ isDiscounted });
</script>

<style scoped>
.shop-cart {
	display: flex;
	flex-direction: column;
	gap: 16px;
}
.shop-cart__empty {
	margin: 0;
	padding: 28px 16px;
	text-align: center;
	color: var(--ink-muted);
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 18px;
}
.shop-cart__lines {
	margin: 0;
	padding: 0;
	list-style: none;
	overflow: hidden;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 18px;
}
.shop-line {
	display: grid;
	grid-template-columns: 48px minmax(0, 1fr) auto;
	grid-template-areas: "photo body amount" "photo stepper stepper";
	align-items: center;
	gap: 8px 12px;
	padding: 12px 14px;
}
.shop-line + .shop-line {
	border-top: 1px solid var(--rule);
}
.shop-line__photo {
	grid-area: photo;
	align-self: start;
	width: 48px;
	height: 48px;
	object-fit: cover;
	background: var(--surface-sunken);
	border-radius: 10px;
}
.shop-line__body {
	grid-area: body;
	min-width: 0;
}
.shop-line__name {
	margin: 0;
	font-size: 15px;
	font-weight: 600;
	line-height: 20px;
	color: var(--ink);
	overflow-wrap: anywhere;
}
.shop-line__unit,
.shop-line__offer,
.shop-line__check {
	margin: 2px 0 0;
	font-size: 12px;
	line-height: 16px;
	color: var(--ink-muted);
}
.shop-line__offer {
	color: var(--signal-text);
	font-weight: 600;
}
.shop-line__check {
	color: var(--warning-text);
	font-weight: 600;
}
.shop-line__amount {
	grid-area: amount;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	margin: 0;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}
.shop-line__amount strong {
	font-size: 15px;
	color: var(--ink);
}
.shop-line__was {
	font-size: 12px;
	color: var(--ink-dim);
}
.shop-stepper {
	grid-area: stepper;
	justify-self: start;
	display: inline-flex;
	align-items: center;
	border: 1px solid var(--border);
	border-radius: 12px;
}
.shop-stepper__button {
	width: 44px;
	height: 44px;
	font-size: 20px;
	line-height: 1;
	color: var(--ink);
	background: transparent;
	border: 0;
	cursor: pointer;
}
.shop-stepper__button:disabled {
	color: var(--ink-dim);
	cursor: default;
}
.shop-stepper__qty {
	min-width: 28px;
	text-align: center;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}
.shop-line__free-qty {
	grid-area: stepper;
	font-size: 13px;
	color: var(--ink-muted);
}
.shop-cart__totals {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 0 4px;
}
.shop-cart__row {
	display: flex;
	justify-content: space-between;
	margin: 0;
	font-size: 14px;
	color: var(--ink-muted);
	font-variant-numeric: tabular-nums;
}
.shop-cart__row--offer span:last-child {
	color: var(--signal-text);
}
.shop-cart__notice {
	margin: 0;
	padding: 12px 14px;
	font-size: 14px;
	line-height: 20px;
	color: var(--warning-ink);
	background: var(--warning-soft);
	border-radius: 12px;
}
.shop-cart__band {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin: 0 -16px;
	padding: 14px 20px;
	background: var(--signal-soft);
}
.shop-cart__band-title {
	margin: 0;
	font-size: 15px;
	font-weight: 700;
	color: var(--ink);
}
.shop-cart__band-hint {
	margin: 2px 0 0;
	font-size: 12px;
	color: var(--ink-muted);
}
.shop-cart__band-amount {
	margin: 0;
	font-family: "Forum", serif;
	font-size: 30px;
	line-height: 34px;
	color: var(--signal-text);
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}
.shop-cart__actions {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
</style>

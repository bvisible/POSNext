<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Scanning in the shop (lot 2): the page the fixed QR code of a -->
	<!-- //// shop till opens, at /pos/shop/<key>. The customer scans the till's articles with the phone's camera (or types a -->
	<!-- //// code), sees the till's prices and offers, and finishes: the cart then waits for the till, which takes it over by -->
	<!-- //// the code shown here (pos_next.shop_scan). A shop that does not let customers scan, or a closed one, is said -->
	<!-- //// politely. Paying on the phone, the sign-in and Nora come in later lots. -->
	<div class="shop-page">
		<div class="shop-canvas" aria-hidden="true">
			<div class="shop-canvas__grid"></div>
			<div class="shop-canvas__glow"></div>
		</div>

		<main class="shop-scroll" :aria-busy="state === 'loading' || busy">
			<p v-if="state === 'loading'" class="shop-status" role="status">
				{{ __("Loading…") }}
			</p>

			<section v-else-if="state === 'unavailable'" class="shop-notice">
				<h1 class="shop-title">{{ unavailable }}</h1>
				<p class="shop-lede">{{ __("Please ask a member of our team.") }}</p>
			</section>

			<template v-else>
				<header class="shop-head">
					<p class="shop-head__name">{{ shopName }}</p>
					<button
						v-if="state !== 'counter' && articles"
						type="button"
						class="shop-head__cart"
						@click="state = 'cart'"
					>
						{{ __("Cart") }} · {{ articles }} · {{ money(cart.grand_total) }}
					</button>
				</header>

				<template v-if="state === 'home'">
					<h1 class="shop-title">{{ __("Scan your articles") }}</h1>
					<p class="shop-lede">
						{{ __("The price shown is the price you pay at the till.") }}
					</p>
					<div class="shop-hero">
						<p class="shop-hero__eyebrow">{{ __("Your cart") }}</p>
						<p class="shop-hero__state">
							{{
								articles
									? `${articlesLabel(articles)} · ${money(cart.grand_total)}`
									: __("empty for now")
							}}
						</p>
						<button
							type="button"
							class="shop-button shop-button--ink"
							@click="state = 'scanner'"
						>
							{{ __("Scan an article") }}
						</button>
						<button
							v-if="articles"
							type="button"
							class="shop-button shop-button--line"
							@click="state = 'cart'"
						>
							{{ __("See my cart") }}
						</button>
					</div>
					<h2 class="shop-subtitle">{{ __("How it works") }}</h2>
					<ol class="shop-steps">
						<li>
							<span class="shop-steps__number" aria-hidden="true">1</span>
							<span>
								<strong>{{ __("Scan") }}</strong>
								{{ __("The shop's articles, with their price.") }}
							</span>
						</li>
						<li>
							<span class="shop-steps__number" aria-hidden="true">2</span>
							<span>
								<strong>{{ __("Go to the till") }}</strong>
								{{ __("Show your code to the seller.") }}
							</span>
						</li>
						<li>
							<span class="shop-steps__number" aria-hidden="true">3</span>
							<span>
								<strong>{{ __("Checked and paid") }}</strong>
								{{ __("A seller checks your cart, then you pay.") }}
							</span>
						</li>
					</ol>
				</template>

				<ShopScanner
					v-else-if="state === 'scanner'"
					:busy="busy"
					:added="added"
					:message="refusal"
					:currency="cart.currency"
					@code="onCode"
					@cart="state = 'cart'"
				/>

				<template v-else-if="state === 'cart'">
					<h1 class="shop-title">{{ __("Your cart") }}</h1>
					<p v-if="refusal" class="shop-refused" role="alert">{{ refusal }}</p>
					<ShopCart
						:cart="cart"
						:busy="busy"
						@qty="onQty"
						@scan="state = 'scanner'"
						@finish="onFinish"
					/>
				</template>

				<ShopCounter v-else-if="state === 'counter'" :cart="cart" />
			</template>
		</main>
	</div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import ShopCart from "@/components/shop/ShopCart.vue";
import ShopCounter from "@/components/shop/ShopCounter.vue";
import ShopScanner from "@/components/shop/ShopScanner.vue";
import {
	articlesIn,
	articlesLabel,
	finishCart,
	formatAmount,
	keepSession,
	openShop,
	scanItem,
	setLineQty,
} from "@/utils/shopScan";

const AT_THE_COUNTER = "At the counter";

const route = useRoute();
const key = String(route.params.key || "");

// loading | unavailable | home | scanner | cart | counter
const state = ref("loading");
const unavailable = ref("");
const shopName = ref("");
const token = ref("");
const cart = ref({ lines: [] });
const busy = ref(false);
const added = ref(null);
const refusal = ref("");

const articles = computed(() => articlesIn(cart.value));

function money(amount) {
	return formatAmount(amount, cart.value?.currency);
}

function show(next) {
	cart.value = next;
	if (next.status === AT_THE_COUNTER) state.value = "counter";
}

async function open() {
	try {
		const shop = await openShop(key);
		token.value = shop.token;
		shopName.value = shop.shopName;
		show(shop.cart);
		if (state.value !== "counter") state.value = "home";
	} catch (error) {
		// The shop does not let customers scan, or it is closed: the server's own words, else a polite sentence
		unavailable.value = error.message || __("Scanning in the shop is not available here.");
		state.value = "unavailable";
	}
}

/** Run a call on the cart; a session the server no longer takes is opened again (the till closed, its lifetime passed). */
async function run(call) {
	busy.value = true;
	refusal.value = "";
	try {
		show(await call());
		return true;
	} catch (error) {
		if (error.kind === "expired") {
			keepSession(key, null);
			await open();
		}
		refusal.value = error.message;
		return false;
	} finally {
		busy.value = false;
	}
}

async function onCode(code) {
	const before = new Map(cart.value.lines.map((line) => [line.line, line.qty]));
	added.value = null;
	if (await run(() => scanItem(token.value, code, 1))) {
		added.value =
			cart.value.lines.find(
				(line) => !line.is_free_item && line.qty > (before.get(line.line) || 0)
			) || null;
		if (navigator.vibrate) navigator.vibrate(30);
	}
}

const onQty = (line, qty) => run(() => setLineQty(token.value, line, qty));

async function onFinish() {
	await run(() => finishCart(token.value));
}

onMounted(open);
</script>

<style scoped>
/* The paper canvas of the Design System (mobile), as on the public menu: warm paper, a faint 32px grid, the signal glow
   top right. Forum sets the titles, Karla the text; the signal is the accent and never a button (the buttons are ink). */
.shop-page {
	--paper: #faf3ea;
	--paper-bright: #fffdf8;
	--surface: #ffffff;
	--surface-sunken: #f6f3ed;
	--border: #dcd4c7;
	--rule: #ece7de;
	--ink: #141414;
	--ink-muted: #524b41;
	--ink-dim: #968c7c;
	--grid: rgba(60, 45, 20, 0.11);
	--signal: #f55d1a;
	--signal-text: #aa3700;
	--signal-soft: #ffeae2;
	--success-ink: #11663a;
	--warning-ink: #92610c;
	--warning-text: #92610c;
	--warning-soft: #fcf2dd;
	--danger-ink: #9c2920;
	--danger-soft: #fbebe7;

	position: relative;
	min-height: 100dvh;
	color: var(--ink);
	font-family: "Karla", "Inter", system-ui, sans-serif;
	font-size: 15px;
	line-height: 20px;
	-webkit-text-size-adjust: 100%;
}
.shop-canvas {
	position: fixed;
	inset: 0;
	z-index: 0;
	overflow: hidden;
	pointer-events: none;
	background: linear-gradient(135deg, var(--paper) 0%, var(--paper-bright) 60%);
}
.shop-canvas__grid {
	position: absolute;
	inset: 0;
	background-image: linear-gradient(to right, var(--grid) 1px, transparent 1px),
		linear-gradient(to bottom, var(--grid) 1px, transparent 1px);
	background-size: 32px 32px;
	mask-image: linear-gradient(to bottom, transparent 0, #000 220px);
}
.shop-canvas__glow {
	position: absolute;
	top: -18%;
	right: -28%;
	width: 116%;
	height: 52%;
	background: radial-gradient(
		ellipse at 70% 0%,
		rgba(245, 93, 26, 0.11) 0%,
		rgba(245, 93, 26, 0) 70%
	);
}
.shop-scroll {
	position: relative;
	z-index: 1;
	display: flex;
	flex-direction: column;
	gap: 18px;
	max-width: 560px;
	margin: 0 auto;
	padding: 20px 16px 40px;
}
.shop-status {
	margin: 30vh 0 0;
	text-align: center;
	color: var(--ink-muted);
}
.shop-notice {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	margin-top: 20vh;
	padding: 32px 20px;
	text-align: center;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 18px;
}
.shop-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}
.shop-head__name {
	margin: 0;
	font-size: 15px;
	font-weight: 600;
	color: var(--ink);
	overflow-wrap: anywhere;
}
.shop-head__cart {
	flex: none;
	min-height: 44px;
	padding: 0 14px;
	font: inherit;
	font-size: 14px;
	font-weight: 600;
	color: #ffffff;
	background: var(--ink);
	border: 0;
	border-radius: 999px;
	cursor: pointer;
}
.shop-title {
	margin: 0;
	font-family: "Forum", serif;
	font-size: 32px;
	font-weight: 400;
	line-height: 36px;
	color: var(--ink);
}
.shop-subtitle {
	margin: 6px 0 0;
	font-family: "Forum", serif;
	font-size: 20px;
	font-weight: 400;
	color: var(--ink);
}
.shop-lede {
	margin: 0;
	font-size: 15px;
	line-height: 21px;
	color: var(--ink-muted);
}
.shop-hero {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 16px;
	background: linear-gradient(135deg, #fceedb, #f5ecd2);
	border: 1px solid #eadfcb;
	border-radius: 18px;
}
.shop-hero__eyebrow {
	margin: 0;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--ink-muted);
}
.shop-hero__state {
	margin: 0;
	font-size: 14px;
	color: var(--ink-muted);
}
.shop-steps {
	display: flex;
	flex-direction: column;
	margin: 0;
	padding: 0;
	list-style: none;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 12px;
}
.shop-steps li {
	display: flex;
	gap: 12px;
	align-items: center;
	padding: 12px 14px;
	font-size: 13px;
	line-height: 18px;
	color: var(--ink-muted);
}
.shop-steps li + li {
	border-top: 1px solid var(--rule);
}
.shop-steps strong {
	display: block;
	font-size: 14px;
	color: var(--ink);
}
.shop-steps__number {
	flex: none;
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	font-weight: 700;
	color: var(--ink);
	background: var(--surface-sunken);
	border-radius: 9px;
}
.shop-refused {
	margin: 0;
	padding: 12px 14px;
	font-size: 14px;
	line-height: 20px;
	color: var(--danger-ink);
	background: var(--danger-soft);
	border-radius: 12px;
}
</style>

<style>
/* The buttons of the shop's page and of its parts (ShopCart, ShopScanner): ink, or an ink outline; 44px and more */
.shop-page .shop-button {
	min-height: 52px;
	padding: 0 18px;
	font: inherit;
	font-size: 16px;
	font-weight: 600;
	border-radius: 14px;
	cursor: pointer;
}
.shop-page .shop-button--small {
	min-height: 48px;
	font-size: 15px;
}
.shop-page .shop-button--ink {
	color: #ffffff;
	background: #141414;
	border: 0;
}
.shop-page .shop-button--line {
	color: #141414;
	background: #ffffff;
	border: 1px solid #141414;
}
.shop-page .shop-button:disabled {
	color: #6f665a;
	background: #ece7de;
	border-color: #ece7de;
	cursor: default;
}
</style>

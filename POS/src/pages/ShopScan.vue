<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Scanning in the shop (lot 2): the page the fixed QR code of a -->
	<!-- //// shop till opens, at /pos/shop/<key>. The customer scans the till's articles with the phone's camera (or types a -->
	<!-- //// code), sees the till's prices and offers, and finishes: the cart then waits for the till, which takes it over by -->
	<!-- //// the code shown here (pos_next.shop_scan). A shop that does not let customers scan, or a closed one, is said -->
	<!-- //// politely. Paying on the phone, the sign-in and Nora come in later lots. -->
	<!-- //// The page is the shop's, not Neoffice's (05.11.2026): neutral as the restaurant's table page, the shop's own -->
	<!-- //// logo top left, as the company keeps it -->
	<div class="shop-page">
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
					<img v-if="shopLogo" class="shop-head__logo" :src="shopLogo" :alt="shopName" />
					<p v-else class="shop-head__name">{{ shopName }}</p>
					<button
						v-if="state !== 'counter' && articles"
						type="button"
						class="shop-head__cart"
						@click="state = 'cart'"
					>
						{{ __("Cart") }} · {{ articles }} · {{ money(amountDue(cart)) }}
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
									? `${articlesLabel(articles)} · ${money(amountDue(cart))}`
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
						@pay="onPay"
					/>
				</template>

				<template v-else-if="state === 'counter'">
					<!-- //// Back from the payment page (lot 4): the provider's word is asked for, and said while it comes -->
					<p v-if="confirming" class="shop-status" role="status">
						{{ __("Confirming your payment…") }}
					</p>
					<p v-if="refusal" class="shop-refused" role="alert">{{ refusal }}</p>
					<ShopCounter :cart="cart" :busy="busy" @pay="onPay" />
				</template>
			</template>
		</main>
	</div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import ShopCart from "@/components/shop/ShopCart.vue";
import ShopCounter from "@/components/shop/ShopCounter.vue";
import ShopScanner from "@/components/shop/ShopScanner.vue";
import {
	amountDue,
	articlesIn,
	articlesLabel,
	confirmPayment,
	finishCart,
	formatAmount,
	keepSession,
	openShop,
	payCart,
	scanItem,
	setLineQty,
} from "@/utils/shopScan";

// A cart that waits for the till, paid on the phone (waiting for its check), or checked: the page shows its code
const SHOWS_ITS_CODE = ["At the counter", "Paid", "Checked"];

const route = useRoute();
const router = useRouter();
const key = String(route.params.key || "");

// loading | unavailable | home | scanner | cart | counter
const state = ref("loading");
const unavailable = ref("");
const shopName = ref("");
const shopLogo = ref("");
const token = ref("");
const cart = ref({ lines: [] });
const busy = ref(false);
const added = ref(null);
const refusal = ref("");
const confirming = ref(false);

const articles = computed(() => articlesIn(cart.value));

function money(amount) {
	return formatAmount(amount, cart.value?.currency);
}

function show(next) {
	cart.value = next;
	if (SHOWS_ITS_CODE.includes(next.status)) state.value = "counter";
}

async function open() {
	try {
		const shop = await openShop(key);
		token.value = shop.token;
		shopName.value = shop.shopName;
		shopLogo.value = shop.shopLogo;
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

/** Leave for the payment page of the cart (lot 4): the cart takes no more scan from now; it comes back to this page. */
async function onPay() {
	busy.value = true;
	refusal.value = "";
	try {
		const { payment_url } = await payCart(token.value);
		window.location.assign(payment_url);
	} catch (error) {
		refusal.value = error.message;
		busy.value = false;
	}
}

/** Back from the payment page: paid on the provider's word, or said failed; the address loses its « payment » query. */
async function backFromThePayment(outcome) {
	router.replace({ query: {} });
	if (outcome === "failed") {
		refusal.value = __("The payment did not go through. Try again, or pay at the till.");
		return;
	}
	confirming.value = true;
	try {
		const answer = await confirmPayment(token.value);
		if (answer?.cart) show(answer.cart);
		if (answer?.status === "failed") {
			refusal.value = __("The payment did not go through. Try again, or pay at the till.");
		} else if (answer?.status !== "paid") {
			refusal.value = __("Your payment is not confirmed yet. Show this code at the till.");
		}
	} catch (error) {
		refusal.value = error.message;
	} finally {
		confirming.value = false;
	}
}

onMounted(async () => {
	await open();
	const outcome = String(route.query.payment || "");
	if (token.value && outcome) await backFromThePayment(outcome);
});
</script>

<style scoped>
/* A neutral page, as the restaurant's table page (GuestOrder): the shop offers it to its own customers, so it carries the
   shop's logo and not Neoffice's design (05.11.2026; design system §7.6). frappe-ui's grays, green-700 on green-100 for an
   offer, the actions in ink and no clay (every action is ink, design system 31.10). Inter, no paper, no grid, no Forum. */
.shop-page {
	--paper: #f8f8f8;
	--surface: #ffffff;
	--surface-sunken: #f3f3f3;
	--border: #e2e2e2;
	--rule: #ededed;
	--ink: #171717;
	--ink-muted: #525252;
	--ink-dim: #7c7c7c;
	--signal: #7c7c7c;
	--signal-text: #171717;
	--signal-soft: #f3f3f3;
	--offer-ink: #137949;
	--offer-soft: #e4faeb;
	--success-ink: #11663a;
	--warning-ink: #92610c;
	--warning-text: #92610c;
	--warning-soft: #fcf2dd;
	--danger-ink: #9c2920;
	--danger-soft: #fbebe7;

	position: relative;
	min-height: 100dvh;
	color: var(--ink);
	background: var(--paper);
	font-family: "Inter", system-ui, sans-serif;
	font-size: 15px;
	line-height: 20px;
	-webkit-text-size-adjust: 100%;
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
/* A white bar across the top, as the restaurant's: the shop's logo, and the cart */
.shop-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	min-height: 60px;
	margin: -20px -16px 0;
	padding: 10px 16px;
	background: var(--surface);
	border-bottom: 1px solid var(--border);
}
/* The logo as the company keeps it: its own proportions, never cropped, tinted or framed */
.shop-head__logo {
	display: block;
	height: 40px;
	width: auto;
	max-width: 60%;
	object-fit: contain;
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
	color: var(--ink);
	background: var(--surface-sunken);
	border: 0;
	border-radius: 999px;
	cursor: pointer;
}
.shop-title {
	margin: 0;
	font-size: 22px;
	font-weight: 700;
	line-height: 28px;
	color: var(--ink);
}
.shop-subtitle {
	margin: 6px 0 0;
	font-size: 16px;
	font-weight: 700;
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
	background: var(--surface);
	border: 1px solid var(--rule);
	border-radius: 16px;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
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
/* The buttons of the shop's page and of its parts (ShopCart, ShopScanner): the main one filled in ink, the others outlined
   in gray, rounded as the restaurant's table page rounds them; 44px and more */
.shop-page .shop-button {
	min-height: 52px;
	padding: 0 18px;
	font: inherit;
	font-size: 16px;
	font-weight: 600;
	border-radius: 12px;
	cursor: pointer;
}
.shop-page .shop-button--small {
	min-height: 48px;
	font-size: 15px;
}
.shop-page .shop-button--ink {
	color: #ffffff;
	background: #171717;
	border: 0;
}
.shop-page .shop-button--ink:active {
	background: #383838;
}
.shop-page .shop-button--line {
	color: #525252;
	background: #ffffff;
	border: 1px solid #e2e2e2;
}
.shop-page .shop-button:disabled {
	color: #999999;
	background: #f3f3f3;
	border-color: #f3f3f3;
	cursor: default;
}
</style>

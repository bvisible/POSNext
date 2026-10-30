<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The public menu: the page that the one QR code on -->
	<!-- //// a restaurant's tables opens, at /pos/menu/<restaurant> (NeoRestau lot 1, task 17). It shows the -->
	<!-- //// restaurant's guest card to read — sections, dishes with their picture, description, price and -->
	<!-- //// badges — and nothing to order: no cart, no table, no account. The QR a waiter brings to a table -->
	<!-- //// (GuestOrder.vue, tied to the table's draft ticket) stays as it is. Upstream POSNext has no guest -->
	<!-- //// surface. Where the restaurant does not publish its menu, whatever the reason, the page says so -->
	<!-- //// politely and shows nothing of what the server answered. -->
	<div class="menu-page">
		<div class="menu-canvas" aria-hidden="true">
			<div class="menu-canvas__grid"></div>
			<div class="menu-canvas__fade"></div>
			<div class="menu-canvas__glow"></div>
		</div>

		<main class="menu-scroll" :aria-busy="state === 'loading'">
			<p v-if="state === 'loading'" class="menu-status" role="status">{{ __("Loading menu...") }}</p>

			<section v-else-if="state === 'unavailable'" class="menu-notice">
				<h1 class="menu-title">{{ __("This menu is not available") }}</h1>
				<p class="menu-lede">{{ __("Please ask a member of our team.") }}</p>
			</section>

			<template v-else>
				<header class="menu-head">
					<img v-if="menu.restaurant.logo" class="menu-logo" :src="menu.restaurant.logo" alt="" />
					<h1 class="menu-title">{{ menu.restaurant.name }}</h1>
					<template v-if="menu.card">
						<p class="menu-eyebrow">{{ menu.card.name }}</p>
						<p v-if="menu.card.description" class="menu-lede">{{ menu.card.description }}</p>
					</template>
					<p v-else class="menu-lede">{{ __("This restaurant has not published its menu yet.") }}</p>
				</header>

				<section v-for="(section, s) in menu.sections" :key="s" class="menu-section">
					<h2 v-if="section.label" class="menu-section__title">{{ section.label }}</h2>
					<ul class="dishes">
						<li v-for="(dish, d) in section.items" :key="d" class="dish">
							<img v-if="dish.image" class="dish__photo" :src="dish.image" alt="" loading="lazy" />
							<div class="dish__body">
								<div class="dish__head">
									<p class="dish__name">
										{{ dish.name }}
										<span
											v-if="dish.spice_level"
											class="dish__spice"
											role="img"
											:aria-label="__('Spice level {0}', [dish.spice_level])"
											:title="__('Spice level {0}', [dish.spice_level])"
										>
											<img v-for="n in dish.spice_level" :key="n" :src="CHILI_ICON" alt="" />
										</span>
									</p>
									<p
										v-if="priceOf(dish)"
										class="dish__price"
										:class="{ 'dish__price--text': !(dish.price > 0) }"
									>
										{{ priceOf(dish) }}
									</p>
								</div>
								<p v-if="dish.description" class="dish__description">{{ dish.description }}</p>
								<ul v-if="dish.badges?.length" class="dish__badges">
									<li v-for="(badge, b) in dish.badges" :key="b" class="badge">
										<span
											class="badge__icon"
											:style="badge.color ? { backgroundColor: badge.color } : null"
										>
											<img v-if="badge.icon" :src="BADGE_ICONS + badge.icon" alt="" />
										</span>
										{{ badge.name }}
									</li>
								</ul>
							</div>
						</li>
					</ul>
				</section>
			</template>
		</main>
	</div>
</template>

<script setup>
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import { fetchPublicMenu, formatPrice, recentPublicMenu } from "@/utils/publicMenu"

// The app's own icons of the badges (the card editor and the printed menu use the same files)
const BADGE_ICONS = "/assets/pos_next/icons/badges/"
const CHILI_ICON = `${BADGE_ICONS}png/chili.png`

const route = useRoute()
const restaurant = route.params.restaurant

// loading | ready | unavailable. The page is built again each time the translations arrive: a menu read a moment ago is
// shown at once instead of loading twice.
const kept = recentPublicMenu(restaurant)
const state = ref(kept ? "ready" : "loading")
const menu = ref(kept)

function priceOf(dish) {
	if (dish.price > 0) return formatPrice(dish.price, menu.value.currency)
	return dish.price_text || ""
}

function titled() {
	document.title = state.value === "ready" ? menu.value.restaurant.name : __("This menu is not available")
}

onMounted(async () => {
	if (!kept) {
		try {
			menu.value = await fetchPublicMenu(restaurant)
			state.value = "ready"
		} catch {
			// Whatever the reason (the restaurant does not publish, NeoRestau is off, the connection dropped), the guest
			// reads the same polite sentence: a refusal is never shown as it came
			state.value = "unavailable"
		}
	}
	titled()
})
</script>

<style scoped>
/* The paper canvas of the Design System (mobile): a warm paper, a faint 32px grid that eases in under the header, and
   the terracotta glow top right. It is fixed behind the page, so that it needs no height of its own. Forum sets the
   titles, Karla the text, and the clay is the colour of a price, as at the till. */
.menu-page {
	--paper: #faf3ea;
	--paper-bright: #fffdf8;
	--surface: #ffffff;
	--surface-sunken: #f6f3ed;
	--border: #dcd4c7;
	--rule: #ece7de;
	--ink: #141414;
	--ink-muted: #524b41;
	--ink-dim: #968c7c;
	--clay: #a15a2e;
	--grid: rgba(60, 45, 20, 0.11);

	position: relative;
	flex: 0 0 auto;
	min-height: 100dvh;
	color: var(--ink);
	font-family: "Karla", "Inter", system-ui, sans-serif;
	font-size: 15px;
	line-height: 20px;
	-webkit-text-size-adjust: 100%;
}

.menu-canvas {
	position: fixed;
	inset: 0;
	z-index: 0;
	overflow: hidden;
	pointer-events: none;
	background: linear-gradient(135deg, var(--paper) 0%, var(--paper-bright) 60%);
}
.menu-canvas__grid {
	position: absolute;
	inset: 0;
	background-image: linear-gradient(to right, var(--grid) 1px, transparent 1px),
		linear-gradient(to bottom, var(--grid) 1px, transparent 1px);
	background-size: 32px 32px;
}
.menu-canvas__fade {
	position: absolute;
	inset: 0 0 auto 0;
	height: 260px;
	background: linear-gradient(
		to bottom,
		var(--paper) 0%,
		var(--paper) 35%,
		rgba(250, 243, 234, 0.7) 60%,
		rgba(250, 243, 234, 0.35) 85%,
		rgba(250, 243, 234, 0) 100%
	);
}
.menu-canvas__glow {
	position: absolute;
	top: -18%;
	right: -28%;
	width: 116%;
	height: 52%;
	background: radial-gradient(ellipse at 70% 0%, rgba(214, 138, 89, 0.11) 0%, rgba(214, 138, 89, 0) 70%);
}

.menu-scroll {
	position: relative;
	z-index: 1;
	max-width: 640px;
	margin: 0 auto;
	padding: 40px 16px 56px;
}

.menu-status {
	margin: 30vh 0 0;
	text-align: center;
	color: var(--ink-muted);
}

.menu-head {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 8px 4px 20px;
	text-align: center;
}
.menu-logo {
	max-width: 160px;
	max-height: 56px;
	margin-bottom: 8px;
	object-fit: contain;
}
/* A heading declares its colour: the global reset would otherwise decide it */
.menu-title {
	margin: 0;
	font-family: "Forum", serif;
	font-size: 34px;
	font-weight: 400;
	line-height: 38px;
	letter-spacing: -0.4px;
	color: var(--ink);
	overflow-wrap: anywhere;
}
.menu-eyebrow {
	margin: 6px 0 0;
	font-size: 11px;
	font-weight: 600;
	line-height: 16px;
	letter-spacing: 0.5px;
	text-transform: uppercase;
	color: var(--ink-muted);
}
.menu-lede {
	max-width: 34em;
	margin: 4px auto 0;
	font-size: 15px;
	line-height: 20px;
	color: var(--ink-muted);
}

.menu-notice {
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
	box-shadow: 0 2px 8px rgba(60, 45, 20, 0.04);
}

.menu-section {
	margin-top: 28px;
}
.menu-section__title {
	margin: 0 4px 12px;
	font-family: "Forum", serif;
	font-size: 24px;
	font-weight: 400;
	line-height: 28px;
	letter-spacing: -0.2px;
	color: var(--ink);
}

.dishes {
	margin: 0;
	padding: 0;
	overflow: hidden;
	list-style: none;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 18px;
	box-shadow: 0 2px 8px rgba(60, 45, 20, 0.04);
}
.dish {
	display: flex;
	align-items: flex-start;
	gap: 14px;
	padding: 14px 16px;
}
.dish + .dish {
	border-top: 1px solid var(--rule);
}
.dish__photo {
	flex: none;
	width: 64px;
	height: 64px;
	object-fit: cover;
	background: var(--surface-sunken);
	border-radius: 12px;
}
.dish__body {
	flex: 1;
	min-width: 0;
}
.dish__head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}
.dish__name {
	flex: 1;
	min-width: 0;
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	line-height: 22px;
	color: var(--ink);
	overflow-wrap: anywhere;
}
.dish__spice {
	display: inline-flex;
	gap: 1px;
	margin-inline-start: 6px;
	vertical-align: -2px;
}
.dish__spice img {
	width: 14px;
	height: 14px;
}
.dish__description {
	margin: 2px 0 0;
	font-size: 14px;
	line-height: 20px;
	color: var(--ink-muted);
	overflow-wrap: anywhere;
}
.dish__badges {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin: 8px 0 0;
	padding: 0;
	list-style: none;
}
.badge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 2px 10px 2px 3px;
	font-size: 12px;
	font-weight: 500;
	line-height: 16px;
	color: var(--ink-muted);
	background: var(--surface-sunken);
	border: 1px solid var(--border);
	border-radius: 999px;
}
.badge__icon {
	display: grid;
	place-items: center;
	width: 18px;
	height: 18px;
	background: var(--ink-dim);
	border-radius: 999px;
}
.badge__icon img {
	width: 11px;
	height: 11px;
	filter: brightness(0) invert(1);
}
.dish__price {
	flex: none;
	max-width: 45%;
	margin: 0;
	font-size: 16px;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	line-height: 22px;
	text-align: end;
	white-space: nowrap;
	color: var(--clay);
}
.dish__price--text {
	font-size: 14px;
	font-weight: 600;
	white-space: normal;
}
</style>

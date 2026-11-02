<!-- //// Neoffice — added file (no upstream equivalent). The order of an open table on a phone, as the waiter mockup -->
<!-- //// draws it (NeoResto lot 1, task 27; product owner, 31.10.2026: « look at your mockup, it is well done… the -->
<!-- //// same for the card as buttons »; mockup WaiterMenu): the ink header (back to the tables, the table, its QR code, the -->
<!-- //// card when the restaurant serves several), the card's types as coloured chips, the card as three buttons per -->
<!-- //// row, and the order one tap away at the bottom. The till decides when it shows (utils/phoneCard.js, -->
<!-- //// phoneOrderShown) and adds the dishes through its own paths: a touch is the card grid's touch, a long press -->
<!-- //// opens the options sheet. Left out until their lot (Ruling 66): the course chips « For: Drinks · Starters · -->
<!-- //// Mains · Desserts » (lot 2, the families of service), « N left » (lot 6, the portions of the day) and the covers -->
<!-- //// of the table, which the till does not record. -->
<template>
	<Teleport to="body">
		<div
			data-phone-order
			class="phone-order fixed inset-0 z-[290] flex flex-col bg-[#FAF3EA] text-[#141414]"
		>
			<header class="bg-[#141414] text-[#FFFDF8] pt-[env(safe-area-inset-top)]">
				<div class="flex items-center justify-between gap-3 px-4 py-3">
					<button
						type="button"
						data-back
						class="min-h-[44px] -ms-1 ps-1 pe-2 flex items-center text-[15px] text-[#FFFDF8] rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFFDF8]"
						@click="askToLeave"
					>
						‹ {{ __("Tables") }}
					</button>
					<div class="flex items-center gap-3 min-w-0">
						<button
							v-if="qrAvailable"
							type="button"
							data-qr
							class="w-11 h-11 shrink-0 flex items-center justify-center rounded-[10px] border border-[#FFFDF8]/40 text-[#FFFDF8] active:bg-[#FFFDF8]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFFDF8]"
							:aria-label="__('Generate QR code for guest ordering')"
							:title="__('Generate QR code for guest ordering')"
							@click="emit('qr')"
						>
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<rect width="5" height="5" x="3" y="3" rx="1" />
								<rect width="5" height="5" x="16" y="3" rx="1" />
								<rect width="5" height="5" x="3" y="16" rx="1" />
								<path d="M21 16h-3a2 2 0 0 0-2 2v3" />
								<path d="M21 21v.01" />
								<path d="M12 7v3a2 2 0 0 1-2 2H7" />
								<path d="M3 12h.01" />
								<path d="M12 3h.01" />
								<path d="M12 16v.01" />
								<path d="M16 12h1" />
								<path d="M21 12v.01" />
								<path d="M12 21v-1" />
							</svg>
						</button>
						<!-- The covers of the table go under its name once the till records them -->
						<div class="text-end min-w-0">
							<div data-table-name class="font-bold text-[16px] leading-tight truncate">{{ orderName }}</div>
						</div>
					</div>
				</div>
				<!-- The card row: the restaurant's cards when it serves several; another card fetched by hand ends it -->
				<div
					v-if="cards.length > 1 || $slots['card-row-end']"
					class="flex items-center gap-1.5 px-3 pb-1 overflow-x-auto phone-order__strip"
				>
					<!-- A finger's target is 44 px high; the pill is drawn inside it -->
					<button
						v-for="one in cards"
						:key="one.name"
						type="button"
						data-card-pill
						:aria-pressed="String(one.name === card?.name)"
						class="min-h-[44px] shrink-0 flex items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFFDF8]"
						@click="emit('update:selectedCard', one.name)"
					>
						<span
							:class="[
								'h-8 px-3 flex items-center rounded-full text-[13px] whitespace-nowrap border transition-colors duration-100',
								one.name === card?.name
									? 'bg-[#FFFDF8] border-[#FFFDF8] text-[#141414] font-bold'
									: 'bg-transparent border-[#FFFDF8]/35 text-[#FFFDF8]',
							]"
							>{{ cardLabel(one) }}</span
						>
					</button>
					<slot name="card-row-end" />
				</div>
			</header>

			<!-- Lot 2 (the families of service) puts its row « For: Drinks · Starters · Mains · Desserts » here -->

			<nav
				v-if="sections.chips.length > 0"
				class="flex gap-1.5 px-3 pt-2.5 pb-2 overflow-x-auto phone-order__strip whitespace-nowrap shrink-0"
			>
				<button
					type="button"
					data-type-chip
					:aria-pressed="String(activeChip === null)"
					:class="chipClasses(activeChip === null)"
					:style="chipStyle(null, activeChip === null)"
					@click="chip = null"
				>
					{{ __("All") }}
				</button>
				<button
					v-for="one in sections.chips"
					:key="one.key"
					type="button"
					data-type-chip
					:aria-pressed="String(activeChip === one.key)"
					:class="chipClasses(activeChip === one.key)"
					:style="chipStyle(one, activeChip === one.key)"
					@click="chip = one.key"
				>
					{{ one.label }}
				</button>
			</nav>

			<main class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-1 pb-3">
				<CardButtonGrid
					v-if="shownButtons.length > 0"
					:buttons="shownButtons"
					:pictures="pictures"
					@tap="(button) => emit('pick', button.entry)"
					@press="(button) => emit('options', button.entry)"
				/>
				<p v-else data-card-empty class="py-10 text-center text-[14px] text-[#6F665A]">{{ __("No items") }}</p>
			</main>

			<footer
				class="shrink-0 bg-[#FFFDF8] border-t border-[#ECE7DE] px-3 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))]"
			>
				<button
					type="button"
					data-open-order
					class="w-full min-h-[54px] px-4 flex items-center justify-between gap-3 rounded-[12px] bg-[#141414] text-[#FFFDF8] font-bold text-[16px] active:bg-[#000000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
					@click="emit('open-order')"
				>
					<span data-order-count class="truncate">{{ orderCount }}</span>
					<span data-order-total class="shrink-0 tabular-nums">{{ orderTotal }}</span>
				</button>
				<p data-gesture-hint class="mt-1.5 text-center text-[12px] text-[#6F665A]">
					{{ __("Tap: +1 · long press: options and remark") }}
				</p>
			</footer>

			<!-- Leaving clears the order on this phone: with lines not sent to the kitchen yet, « ‹ Tables » asks first, and -->
			<!-- staying is the default (Ruling 90). Nothing is asked when every line was sent. -->
			<div
				v-if="leaveAsk"
				data-leave-ask
				role="alertdialog"
				aria-modal="true"
				:aria-label="leaveQuestion"
				class="phone-order__overlay absolute inset-0 z-10 flex items-end justify-center px-3 pb-[max(16px,env(safe-area-inset-bottom))]"
				@click.self="stay"
				@keydown.esc.stop="stay"
			>
				<div class="w-full max-w-[420px] rounded-[16px] bg-[#FFFDF8] p-4">
					<p data-leave-question class="m-0 text-[16px] font-bold leading-snug text-[#141414]">{{ leaveQuestion }}</p>
					<div class="mt-4 flex gap-2.5">
						<button
							type="button"
							data-leave-go
							class="flex-1 min-h-[44px] rounded-[12px] border border-[#DCD4C7] bg-[#FFFDF8] text-[#141414] font-bold text-[16px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
							@click="leave"
						>
							{{ __("Leave") }}
						</button>
						<button
							ref="stayButton"
							type="button"
							data-leave-stay
							class="flex-1 min-h-[44px] rounded-[12px] bg-[#141414] text-[#FFFDF8] font-bold text-[16px] active:bg-[#000000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
							@click="stay"
						>
							{{ __("Stay") }}
						</button>
					</div>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { usePOSShiftStore } from "@/stores/posShift"
import { useRestaurantStore } from "@/stores/restaurant"
import { cardLabel } from "@/utils/cardLabel"
import { formatCurrency, formatCurrencyNumber } from "@/utils/currency"
import { articleCount, cardSections, formatCount, orderedByItem, softTint, unsentLines } from "@/utils/phoneCard"
import CardButtonGrid from "./CardButtonGrid.vue"

const props = defineProps({
	// The cards the till offers right now (the restaurant store's active cards)
	cards: { type: Array, default: () => [] },
	// The card chosen, shared with the card row of a tablet
	selectedCard: { type: String, default: "" },
	// The stock of a card item, null when not counted: the card grid's rule (POSSale.vue, getCardItemStock)
	stockOf: { type: Function, default: () => null },
	//// Neoffice — a sold-out button is disabled only where the restaurant greys sold-out dishes out (NeoResto lot 1, Daniel, 02.11.2026); otherwise a tap takes the order and the till warns
	greyOut: { type: Boolean, default: true },
	//// Neoffice — whether the kitchen counts an item by portions (an entry of the card answers): a sold-out one stays touchable, the touch asks for more portions
	countedBy: { type: Function, default: () => false },
})

const emit = defineEmits(["update:selectedCard", "back", "qr", "pick", "options", "open-order"])

const cartStore = usePOSCartStore()
const restaurantStore = useRestaurantStore()
const settingsStore = usePOSSettingsStore()
const shiftStore = usePOSShiftStore()

// The card shown: the one chosen, else the first one
const card = computed(() => props.cards.find((one) => one.name === props.selectedCard) || props.cards[0] || null)
const sections = computed(() => cardSections(card.value?.items || []))

// The type chosen (null: all); back to all when the card changes
const chip = ref(null)
watch(
	() => card.value?.name,
	() => {
		chip.value = null
	},
)
const activeChip = computed(() => (sections.value.chips.some((one) => one.key === chip.value) ? chip.value : null))

// Pictures only where the till asks for them (POS Settings.phone_card_pictures, off by default)
const pictures = computed(() => Boolean(Number(settingsStore.settings?.phone_card_pictures)))

const ordered = computed(() => orderedByItem(cartStore.invoiceItems))
const menus = computed(() => new Map((restaurantStore.activeMenus || []).map((menu) => [menu.name, menu])))

function detailOf(entry) {
	if (entry.item_type === "Menu") {
		const courses = menus.value.get(entry.menu)?.courses?.length || 0
		return courses ? __("{0} courses", [courses], "Menu courses") : null
	}
	const groups = restaurantStore.getModifiersForItem?.(entry.item, entry.item_group) || []
	return groups.length > 0 ? __("options", null, "Card button") : null
}

const buttons = computed(() =>
	sections.value.buttons.map(({ key, entry, chip: chipKey, color }) => {
		const isItem = entry.item_type === "Item"
		const stock = isItem ? props.stockOf(entry) : null
		return {
			key,
			entry,
			chip: chipKey,
			color,
			name: entry.item_name || entry.menu_name || entry.label || "",
			price: formatCurrencyNumber(Number(entry.price || entry.default_price || 0)),
			detail: detailOf(entry),
			count: isItem ? ordered.value.get(entry.item) || 0 : 0,
			soldOut: props.greyOut && stock !== null && stock !== undefined && Number(stock) <= 0,
			addable: isItem && props.greyOut && stock !== null && stock !== undefined && Number(stock) <= 0 && props.countedBy(entry),
			image: entry.image || null,
		}
	}),
)
const shownButtons = computed(() =>
	activeChip.value === null ? buttons.value : buttons.value.filter((button) => button.chip === activeChip.value),
)

const orderName = computed(() =>
	cartStore.isTakeaway
		? cartStore.takeawayNumber || ""
		: cartStore.restaurantTable?.table_name || cartStore.restaurantTable?.name || "",
)
const qrAvailable = computed(() =>
	Boolean(restaurantStore.restaurantSettings?.enable_qr_ordering && cartStore.restaurantTable && !cartStore.isTakeaway),
)

const orderCount = computed(() => {
	const count = articleCount(cartStore.invoiceItems)
	if (count === 0) return __("Order · no items")
	if (count === 1) return __("Order · 1 item")
	return __("Order · {0} items", [formatCount(count)])
})
const orderTotal = computed(
	() => `${formatCurrency(Number(cartStore.roundedGrandTotal) || 0, shiftStore.profileCurrency)} ›`,
)

// « ‹ Tables »: the till's closeTable clears the order, so lines not sent to the kitchen yet would be lost in one tap.
// This screen asks first (Ruling 90; the tablet's way back and closeTable itself are left as they are)
const leaveAsk = ref(false)
const stayButton = ref(null)
const unsentCount = computed(() => unsentLines(cartStore.invoiceItems).length)
const leaveQuestion = computed(() => {
	const count = unsentCount.value
	if (cartStore.isTakeaway) {
		return count === 1
			? __("Leave this order? 1 line not sent will be lost.")
			: __("Leave this order? {0} lines not sent will be lost.", [count])
	}
	return count === 1
		? __("Leave this table? 1 line not sent will be lost.")
		: __("Leave this table? {0} lines not sent will be lost.", [count])
})

function askToLeave() {
	if (unsentCount.value === 0) {
		emit("back")
		return
	}
	leaveAsk.value = true
	nextTick(() => stayButton.value?.focus?.())
}

function stay() {
	leaveAsk.value = false
}

function leave() {
	leaveAsk.value = false
	emit("back")
}

function chipClasses(active) {
	return [
		"min-h-[36px] shrink-0 px-2.5 rounded-[8px] border-b-[3px] text-[13px] leading-none transition-colors duration-100",
		active ? "font-bold text-[#FFFDF8]" : "text-[#141414]",
	]
}

// A chip in its colour (the mockup: a soft background, a 3 px bottom border); the chosen one in ink
function chipStyle(one, active) {
	const color = one?.color || null
	if (active) return { backgroundColor: "#141414", borderBottomColor: color || "#141414" }
	return color
		? { backgroundColor: softTint(color), borderBottomColor: color }
		: { backgroundColor: "#FFFDF8", borderBottomColor: "#DCD4C7" }
}
</script>

<style scoped>
/* A row that scrolls sideways (the cards, the types) shows no scrollbar: a finger moves it */
.phone-order__strip {
	scrollbar-width: none;
	-ms-overflow-style: none;
}

.phone-order__strip::-webkit-scrollbar {
	display: none;
}

/* The design system's overlay (--surface-overlay); the till does not load the tokens yet, so its value backs it */
.phone-order__overlay {
	background: var(--surface-overlay, rgba(24, 20, 16, 0.55));
}
</style>

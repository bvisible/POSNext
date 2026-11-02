<!-- //// Neoffice — added file (no upstream equivalent). The options of a dish on a phone, in a sheet from the bottom -->
<!-- //// of the screen, as the waiter mockup draws it (NeoResto lot 1, task 27; mockup WaiterOptions; design § G, -->
<!-- //// validated as is by the product owner: « required, one of, extras, a remark for the kitchen with a microphone -->
<!-- //// to dictate, quantity »). It takes the options dialog's place on a phone (ItemModifiersDialog.vue keeps -->
<!-- //// tablets and computers) and keeps its contract: open(line) edits a line of the order in place, through the -->
<!-- //// cart's own updateItemModifiers, and says « saved » with the line. A long press on the card adds with -->
<!-- //// openForCardItem(cardItem): nothing reaches the order until « Add ». Left out until lot 2 (Ruling 66): -->
<!-- //// « Served with the mains · Change », the course a dish is served with. -->
<template>
	<Teleport to="body">
		<Transition name="phone-sheet">
			<div
				v-if="show"
				data-options-sheet
				class="fixed inset-0 z-[295] flex flex-col justify-end"
				@keydown.esc="close"
			>
				<div
					data-sheet-backdrop
					class="phone-sheet__backdrop absolute inset-0"
					@pointerdown="backdropPressed = true"
					@click="closeFromBackdrop"
				/>
				<section
					ref="panel"
					role="dialog"
					aria-modal="true"
					:aria-label="__('Options of {0}', [name])"
					tabindex="-1"
					class="phone-sheet__panel relative flex flex-col rounded-t-[18px] bg-[#FFFDF8] text-[#141414] outline-none"
					:style="dragOffset ? { transform: `translateY(${dragOffset}px)` } : null"
				>
					<div
						class="phone-sheet__grip px-4 pt-4"
						@pointerdown="dragStart"
						@pointermove="dragMove"
						@pointerup="dragEnd"
						@pointercancel="dragEnd"
					>
						<div class="mx-auto w-10 h-1 rounded-[2px] bg-[#DCD4C7]" aria-hidden="true" />
						<div class="mt-3 flex items-baseline justify-between gap-3">
							<h2 data-sheet-title class="font-display font-normal text-[28px] leading-[1.1] m-0 min-w-0 break-words">
								{{ name }}
							</h2>
							<span data-sheet-price class="shrink-0 font-bold text-[16px] tabular-nums">{{
								formatCurrencyNumber(basePrice)
							}}</span>
						</div>
					</div>

					<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-3 flex flex-col gap-3">
						<div v-for="group in groups" :key="group.group_name" data-option-group>
							<div v-if="groupRule(group) === 'required'" class="mb-1.5 flex justify-between gap-2 text-[13px]">
								<b data-group-label>{{ group.group_name }}</b>
								<span data-group-rule class="font-bold text-[#A15A2E]">{{
									__("required", null, "Option group")
								}}</span>
							</div>
							<div v-else class="mb-1.5 text-[13px]">
								<b data-group-label>{{ group.group_name }}</b>
								<span data-group-rule class="text-[#6F665A]"> · {{ ruleLabel(group) }}</span>
							</div>
							<div class="grid gap-1.5" :style="{ gridTemplateColumns: `repeat(${columnsOf(group)}, minmax(0, 1fr))` }">
								<button
									v-for="option in group.options"
									:key="option.option_name"
									type="button"
									data-option
									:aria-pressed="String(isChosen(group, option))"
									:class="['phone-sheet__option', isChosen(group, option) ? 'phone-sheet__option--chosen' : '']"
									@click="choose(group, option)"
								>
									{{ option.option_name }}<template v-if="deltaOf(option)"> · {{ deltaOf(option) }}</template>
								</button>
							</div>
						</div>

						<div>
							<label for="phone-options-remark" class="text-[13px] font-bold">{{ __("Remark for the kitchen") }}</label>
							<div class="mt-1.5 flex gap-2">
								<input
									id="phone-options-remark"
									v-model="remark"
									data-remark
									type="text"
									autocomplete="off"
									enterkeyhint="done"
									class="flex-1 min-w-0 min-h-[44px] rounded-[10px] border border-[#DCD4C7] bg-white px-3 text-[16px] text-[#141414] focus:outline-none focus:border-[#141414]"
								/>
								<button
									v-if="dictation.supported"
									type="button"
									data-dictate
									:aria-label="dictation.listening.value ? __('Stop dictating') : __('Dictate the remark')"
									:aria-pressed="String(dictation.listening.value)"
									:class="[
										'w-12 min-h-[44px] shrink-0 flex items-center justify-center rounded-[10px] border border-[#141414] transition-colors duration-100',
										dictation.listening.value ? 'bg-[#141414] text-[#FFFDF8]' : 'bg-[#FFFDF8] text-[#141414]',
									]"
									@click="dictation.toggle()"
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
										<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
										<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
										<line x1="12" x2="12" y1="19" y2="22" />
									</svg>
								</button>
							</div>
							<p v-if="dictation.denied.value" data-dictation-denied class="mt-1 text-[12px] text-[#6F665A]">
								{{ __("The microphone is not allowed on this device") }}
							</p>
						</div>
						<!-- Lot 2 (the families of service) puts « Served with the mains · Change » here -->
					</div>

					<div class="flex items-center gap-2.5 px-4 pt-3 pb-[max(18px,env(safe-area-inset-bottom))]">
						<div class="flex items-center rounded-[12px] border border-[#DCD4C7]">
							<button
								type="button"
								data-less
								:aria-label="__('One less')"
								:disabled="portions <= 1"
								class="w-12 h-[52px] text-[22px] text-[#141414] disabled:text-[#BFB5A4]"
								@click="portions = Math.max(1, portions - 1)"
							>
								−
							</button>
							<span data-portions class="w-7 text-center text-[18px] font-bold tabular-nums" aria-live="polite">{{
								portions
							}}</span>
							<button
								type="button"
								data-more
								:aria-label="__('One more')"
								class="w-12 h-[52px] text-[22px] text-[#141414]"
								@click="portions += 1"
							>
								+
							</button>
						</div>
						<button
							type="button"
							data-confirm
							:disabled="!complete || finishing"
							class="flex-1 min-h-[54px] rounded-[12px] bg-[#141414] text-[#FFFDF8] font-bold text-[16px] tabular-nums disabled:bg-[#BFB5A4] disabled:text-[#FFFDF8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
							@click="confirm"
						>
							{{ confirmLabel }}
						</button>
					</div>
				</section>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref } from "vue"
import { useDictation } from "@/composables/useDictation"
import { usePOSCartStore } from "@/stores/posCart"
import { useRestaurantStore } from "@/stores/restaurant"
import { cartRowOf } from "@/utils/cartRow"
import { formatCurrencyNumber } from "@/utils/currency"
import { cardItemLine, groupRule, pricedChoice } from "@/utils/phoneCard"

const emit = defineEmits(["saved"])

const cartStore = usePOSCartStore()
const restaurantStore = useRestaurantStore()

const show = ref(false)
// What the sheet works on: a card item to add (a long press) or a line of the order to edit (the dialog's contract)
const entry = ref(null)
const line = ref(null)
const selections = ref({})
const remark = ref("")
const portions = ref(1)
// What the line held when it was opened: its options, and its portions and their quantity
const lineHadOptions = ref(false)
let openedWith = { portions: 1, quantityValue: 0 }
const panel = ref(null)

const dictation = useDictation({
	onText: (text) => {
		const before = remark.value.trimEnd()
		remark.value = before ? `${before} ${text}` : text
	},
})

const editing = computed(() => line.value !== null)
const itemCode = computed(() => (editing.value ? line.value.item_code : entry.value?.item))
const itemGroup = computed(() => (editing.value ? line.value.item_group : entry.value?.item_group))
const groups = computed(() =>
	itemCode.value ? restaurantStore.getModifiersForItem(itemCode.value, itemGroup.value) || [] : [],
)
const name = computed(() =>
	editing.value ? line.value.item_name || line.value.item_code : entry.value?.item_name || entry.value?.label || "",
)
// The price of a portion without its options: a line carries its options in its rate (updateItemModifiers)
const basePrice = computed(() =>
	editing.value
		? (Number(line.value.rate) || 0) - (Number(line.value._modifiers_applied) || 0)
		: Number(entry.value?.price || entry.value?.default_price || 0),
)
const choice = computed(() => pricedChoice(basePrice.value, groups.value, selections.value, portions.value))
// Every required group has its choice
const complete = computed(() =>
	groups.value.every((group) => !group.required || (selections.value[group.group_name] || []).length > 0),
)
const confirmLabel = computed(() => {
	const total = formatCurrencyNumber(choice.value.total)
	return editing.value && lineHadOptions.value ? __("Save · {0}", [total]) : __("Add · {0}", [total])
})

function ruleLabel(group) {
	return groupRule(group) === "single" ? __("choose one", null, "Option group") : __("optional", null, "Option group")
}

// The mockup's grids: four short choices to a row, two when they carry a price; fewer for long names, and four
// choices that do not fit four to a row go two by two rather than three and one
function columnsOf(group) {
	const options = group.options || []
	if (options.some((option) => Number(option.price_adjustment))) return 2
	const longest = Math.max(0, ...options.map((option) => String(option.option_name || "").length))
	const most = longest > 16 ? 2 : longest > 11 ? 3 : 4
	if (options.length <= most) return Math.max(2, options.length)
	return options.length === 4 ? 2 : most
}

function deltaOf(option) {
	const delta = Number(option.price_adjustment) || 0
	if (!delta) return ""
	return `${delta > 0 ? "+" : "−"}${formatCurrencyNumber(Math.abs(delta))}`
}

function isChosen(group, option) {
	return (selections.value[group.group_name] || []).includes(option.option_name)
}

// One choice in a group of one (a second touch takes it back), several in the others up to their limit
function choose(group, option) {
	const chosen = [...(selections.value[group.group_name] || [])]
	const at = chosen.indexOf(option.option_name)
	let next
	if (group.selection_type === "Single") {
		next = at >= 0 ? [] : [option.option_name]
	} else if (at >= 0) {
		chosen.splice(at, 1)
		next = chosen
	} else {
		next = chosen.length < (group.max_selections || 99) ? [...chosen, option.option_name] : chosen
	}
	selections.value = { ...selections.value, [group.group_name]: next }
}

// The defaults of the groups that hold no choice yet
function withDefaults(chosen) {
	const next = { ...chosen }
	for (const group of groups.value) {
		if (next[group.group_name]?.length) continue
		const defaults = (group.options || []).filter((option) => option.is_default).map((option) => option.option_name)
		if (defaults.length) next[group.group_name] = defaults
	}
	return next
}

// A touch on the backdrop closes the sheet. The sheet of a long press opens under the finger still resting on the card:
// the click its lift may make lands on the backdrop without having been pressed there, and must not close it
let backdropPressed = false
function closeFromBackdrop() {
	const pressed = backdropPressed
	backdropPressed = false
	if (pressed) close()
}

function openSheet() {
	backdropPressed = false
	finishing.value = false
	// A microphone refused on the last dish is offered again
	dictation.reset()
	show.value = true
	nextTick(() => panel.value?.focus?.())
}

/**
 * A long press on the card: the options of a dish not yet in the order.
 * @param {Object} cardItem - An Item row of a card
 */
function openForCardItem(cardItem) {
	line.value = null
	entry.value = cardItem
	lineHadOptions.value = false
	selections.value = withDefaults({})
	remark.value = ""
	portions.value = 1
	openedWith = { portions: 1, quantityValue: 0 }
	openSheet()
}

/**
 * The options of a line of the order, as the options dialog opens them (ItemModifiersDialog.vue, open).
 * @param {Object} cartLine - The line, or a copy the cart shows of it
 */
function open(cartLine) {
	const row = cartRowOf(cartLine)
	if (!row) return
	entry.value = null
	line.value = row
	let saved = []
	try {
		saved = row.posa_item_modifiers ? JSON.parse(row.posa_item_modifiers) : []
	} catch {
		saved = []
	}
	const chosen = {}
	let quantityValue = 0
	for (const modifier of Array.isArray(saved) ? saved : []) {
		chosen[modifier.group] = (modifier.options || []).map((option) => option.name)
		for (const option of modifier.options || []) if (Number(option.quantity_value) > 0) quantityValue = Number(option.quantity_value)
	}
	lineHadOptions.value = Object.values(chosen).some((names) => names.length > 0)
	selections.value = withDefaults(chosen)
	remark.value = row.posa_special_instructions || ""
	const quantity = Number(row.quantity) || 1
	portions.value = Math.max(1, Math.round(quantityValue > 0 ? quantity / quantityValue : quantity))
	openedWith = { portions: portions.value, quantityValue }
	openSheet()
}

function close() {
	dictation.abort()
	dragOffset.value = 0
	show.value = false
}

// « Add » pressed while the microphone is still open: the last words come with the end of the dictation, so the dish
// waits for them (a moment at most) rather than reaching the kitchen without them
const finishing = ref(false)

function confirm() {
	if (!complete.value || finishing.value) return
	if (dictation.listening.value) {
		finishing.value = true
		dictation.finish().then(() => {
			finishing.value = false
			if (show.value) commit()
		})
		return
	}
	commit()
}

function commit() {
	const priced = choice.value
	const modifiers = JSON.stringify(priced.modifiers)
	const text = remark.value.trim()
	let saved = null
	// A dish added here (a long press), not a line opened from the order
	let added = false
	if (editing.value) {
		const row = line.value
		const index = cartStore.invoiceItems.indexOf(row)
		// The line's quantity is left as it is unless the portions or the quantity an option sets were changed here
		const untouched =
			portions.value === openedWith.portions && priced.quantityValue === openedWith.quantityValue
		cartStore.updateItemModifiers(
			row.item_code,
			row.uom,
			modifiers,
			text,
			priced.adjustment,
			untouched ? 0 : priced.quantity,
			index,
		)
		saved = index >= 0 ? cartStore.invoiceItems[index] : row
	} else {
		added = true
		const dish = cardItemLine(entry.value, restaurantStore.getStationForItem)
		// A dish whose price is typed at the till (0.00 here) gets a line of its own, so that a cancelled price takes
		// back this line and nothing else
		if (priced.modifiers.length === 0 && !text && priced.unit > 0) {
			// Nothing chosen: the dish joins its plain line, as a touch would
			cartStore.addItem(dish, priced.quantity)
			saved = cartStore.invoiceItems.findLast(
				(one) =>
					one.item_code === dish.item_code &&
					!one.is_free_item &&
					!one.posa_item_modifiers &&
					!one.posa_special_instructions,
			)
		} else {
			// A line of its own (the cart never merges a line that carries options or a remark), then priced through the
			// cart's one path for options, as the dialog prices it
			cartStore.addItem({ ...dish, posa_item_modifiers: modifiers, posa_special_instructions: text }, 1)
			const last = cartStore.invoiceItems.length - 1
			const index =
				cartStore.invoiceItems[last]?.item_code === dish.item_code
					? last
					: cartStore.invoiceItems.findLastIndex((one) => one.item_code === dish.item_code)
			cartStore.updateItemModifiers(
				dish.item_code,
				undefined,
				modifiers,
				text,
				priced.adjustment,
				priced.quantity,
				index,
			)
			saved = cartStore.invoiceItems[index] || null
		}
	}
	close()
	// The till opens the price of a dish left at 0.00; told it was added here, it takes the dish back if that price is
	// cancelled (POSSale.vue, handleModifiersSaved)
	if (saved) emit("saved", ...(added ? [saved, { added: true }] : [saved]))
}

// The grip: a sheet pulled down far enough closes
const dragOffset = ref(0)
let dragFrom = null
function dragStart(event) {
	if (event.button !== undefined && event.button !== 0) return
	dragFrom = event.clientY
}
function dragMove(event) {
	if (dragFrom === null) return
	dragOffset.value = Math.max(0, event.clientY - dragFrom)
}
function dragEnd() {
	if (dragFrom === null) return
	dragFrom = null
	if (dragOffset.value > 100) close()
	else dragOffset.value = 0
}

onUnmounted(() => dictation.abort())

defineExpose({ open, openForCardItem, close })
</script>

<style scoped>
/* The mockup's choices: 44 px, 10 px corners; the one chosen in ink */
.phone-sheet__option {
	min-height: 44px;
	padding: 4px;
	border: 1px solid #dcd4c7;
	border-radius: 10px;
	background: #ffffff;
	color: #141414;
	/* 14 px on a 390 px phone, 13 px on a 360 px one: « Saignante » in bold fits a quarter of the row in both */
	font-size: clamp(12px, 3.6vw, 14px);
	line-height: 1.2;
	overflow-wrap: break-word;
	hyphens: auto;
	touch-action: manipulation;
	-webkit-tap-highlight-color: transparent;
}

.phone-sheet__option--chosen {
	border: 2px solid #141414;
	background: #141414;
	color: #fffdf8;
	font-weight: 700;
}

/* The sheet never hides the whole screen; the dynamic height leaves out a phone browser's address bar */
/* The design system's overlay (--surface-overlay); the till does not load the tokens yet, so its value backs it */
.phone-sheet__backdrop {
	background: var(--surface-overlay, rgba(24, 20, 16, 0.55));
}

.phone-sheet__panel {
	max-height: 92vh;
	max-height: 92dvh;
}

.phone-sheet__grip {
	touch-action: none;
	cursor: grab;
}

.phone-sheet-enter-active,
.phone-sheet-leave-active {
	transition: opacity 200ms ease;
}

.phone-sheet-enter-active .phone-sheet__panel,
.phone-sheet-leave-active .phone-sheet__panel {
	transition: transform 220ms cubic-bezier(0.2, 0, 0, 1);
}

.phone-sheet-enter-from,
.phone-sheet-leave-to {
	opacity: 0;
}

.phone-sheet-enter-from .phone-sheet__panel,
.phone-sheet-leave-to .phone-sheet__panel {
	transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
	.phone-sheet-enter-active,
	.phone-sheet-leave-active,
	.phone-sheet-enter-active .phone-sheet__panel,
	.phone-sheet-leave-active .phone-sheet__panel {
		transition: none;
	}
}
</style>

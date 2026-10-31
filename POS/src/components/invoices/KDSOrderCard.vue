<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Upstream POSNext is a retail POS: -->
	<!-- //// no kitchen, no preparation. Neoffice sells POS to restaurants, so items are routed -->
	<!-- //// to preparation stations (Bar / Kitchen) and shown on a Preparation Display as -->
	<!-- //// post-it cards; this is one card. It carries: per-item kds_status with a context menu -->
	<!-- //// that updates optimistically and rolls back on error (a touch screen behind a pass -->
	<!-- //// cannot wait for a round trip), batch separators so a second send is visibly not part -->
	<!-- //// of the first, a "Coming Next" preview of items ordered but not yet sent, two timers -->
	<!-- //// (time since the last action, big, and total table time, small), takeaway orders, and -->
	<!-- //// structured item modifiers. Also warns before Delivered when the Runner screen is -->
	<!-- //// active, since that would skip the runner. (e005b94b 2026-03-21 preparation stations; -->
	<!-- //// 831857f2 per-item KDS status; 0e226900 2026-03-22 post-it grid; 4d9eebb2 per-item -->
	<!-- //// status menu; aee5c179 optimistic updates; db5f4ead + 425a228a 2026-03-23 timers; -->
	<!-- //// a5c19a43 status preservation; 7a63644a "Coming Next"; 9eff4ab6 full invoice number; -->
	<!-- //// 34ee11a8 2026-03-25 runner confirmation; 644ad918 2026-03-26 takeaway; 07d0d493 -->
	<!-- //// 2026-03-29 batch separation.) -->
	<!-- //// Neoffice — a ticket never grows past its band (task 23). The kitchen screen is used on tablets and a ticket can -->
	<!-- //// hold twenty-five dishes with options and remarks: the ticket is a column bounded by its band (a lane stretches -->
	<!-- //// it to the lane's height, a column of tickets caps it with --ticket-max-h), its head and its main button keep -->
	<!-- //// their size, and the dishes in between scroll by touch. -->
	<div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border-l-4 flex flex-1 flex-col min-h-0 max-h-[var(--ticket-max-h,none)]"
		:class="borderColorClass" data-test="ticket" :data-state="status">

		<!-- Header -->
		<!-- The frame (padding, title, order number, timer, dish lines) is the one the runner ticket has: utils/ticketLayout -->
		<!-- //// Neoffice — the header is ONE line (task 38a-1, rulings 125 and 126): the room's code as a small chip, the TABLE big and bold, the ticket's -->
		<!-- //// number, the timer at the right. The invoice's own name is never shown here (ruling 122: a draft takes its Sales Invoice number at the -->
		<!-- //// first save, so it is no ticket number: it is shown only once the sale is validated). The ticket number is `ticket_no` when the order -->
		<!-- //// carries one (the server fills it in with the ticket counter), and for a takeaway the counter it has had until then. The state is NOT -->
		<!-- //// written here: the left border and the band the card stands in carry it. `showState` writes it beside the timer for a screen that mixes -->
		<!-- //// the states (placement A of ruling 126). The second timer, the table's total time, shows only in the large sizes. -->
		<div class="flex-shrink-0 border-b border-gray-100 dark:border-gray-700" :class="[TICKET_FRAME.header, KITCHEN_FRAME.header]" data-test="ticket-header">
			<div class="flex items-center justify-between gap-x-1.5">
				<div class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5" data-test="ticket-ref">
					<span v-if="roomChip" data-test="ticket-room"
						class="rounded-md bg-gray-100 px-1.5 text-[length:var(--kds-fs-ref,11px)] font-semibold leading-snug tracking-wide text-gray-600 dark:bg-gray-700">
						{{ roomChip }}
					</span>
					<h3 data-test="ticket-title" class="whitespace-nowrap text-gray-900 dark:text-white" :class="[TICKET_FRAME.title, KITCHEN_FRAME.title]">
						<template v-if="order.is_takeaway">{{ __("Takeaway") }}</template>
						<template v-else>{{ order.table_display_name || order.restaurant_table }}</template>
					</h3>
					<span v-if="ticketNumber" data-test="ticket-number" class="text-gray-500 font-medium tabular-nums" :class="[TICKET_FRAME.number, KITCHEN_FRAME.number]">
						{{ order.is_takeaway ? "· " : "" }}{{ ticketNumber }}
					</span>
				</div>
				<div class="flex flex-none items-baseline gap-1.5">
					<!-- //// Neoffice — the badge keeps the classes the dark mode gave it (task 46); it is drawn only where states mix -->
					<span v-if="showState" class="text-[10px] uppercase font-bold tracking-wider rounded-full px-2 py-0.5 self-center"
						data-test="ticket-status" :class="statusBadgeClass">
						{{ kitchenStatusLabel(status, { takeaway: isTakeaway }) }}
					</span>
					<span class="font-mono tabular-nums text-gray-400 whitespace-nowrap [display:var(--kds-tt-d,none)] text-[length:var(--kds-fs-tt,10px)]"
						data-test="ticket-total-time" :title="__('Total time')">
						{{ totalTime }}
					</span>
					<span class="whitespace-nowrap" data-test="ticket-timer" :class="[TICKET_FRAME.timer, KITCHEN_FRAME.timer, timeColorClass]">
						{{ elapsedTime }}
					</span>
				</div>
			</div>
		</div>

		<!-- Actions -->
		<!-- //// Neoffice — the main button sits DIRECTLY UNDER the header and never scrolls (task 38a-1, ruling 107): it was at the foot of the card, below the -->
		<!-- //// dishes, and a long ticket pushed it out of sight. It takes the width, and the 44 px icon of the print button stands at its right when the screen can -->
		<!-- //// print (task 44 fills it in; `canPrint` is false until then). The buttons are as high as the size chosen says (`--kds-btn-h`), never less than 44 px. -->
		<!-- //// Neoffice — dark mode (task 46): the Button's own ink fill turns to bright paper in dark (frappe-ui's `surface-gray-7`) and these buttons forced `text-white` on it: white on near-white, a blank square. `dark:enabled:text-ink-white` gives the Button's own text colour back in dark while it is enabled (a loading button is greyed and keeps the white). Light mode is untouched. -->
		<div class="flex flex-shrink-0 items-stretch gap-1.5 border-b border-gray-100 px-2 pb-2 pt-0.5 dark:border-gray-700" data-test="ticket-actions">
			<!-- //// Neoffice — ONE main button, whose action follows the ticket and its station (task 38a-1, ruling 112): Start on a ticket to start; on a ticket being -->
			<!-- //// cooked, "Ready" when a runner carries the dishes on and "Deliver" when the cook does (one gesture, no "Ready" between); "Deliver" on a ticket that is -->
			<!-- //// ready; from the list of what waits at the pass, a call-back to preparation. The first three are the ink button, the others its outline. -->
			<Button
				v-if="inkAction"
				variant="solid"
				size="lg"
				data-test="ticket-main"
				class="min-w-0 flex-1 !h-[var(--kds-btn-h,44px)] !text-[length:var(--kds-fs-btn,14px)] font-bold text-white dark:enabled:text-ink-white"
				@click="onMainPress"
				:loading="loading"
			>
				{{ mainLabel }}
			</Button>

			<Button
				v-if="outlineAction && !showDeliveredConfirm"
				variant="outline"
				size="lg"
				data-test="ticket-main"
				class="min-w-0 flex-1 !h-[var(--kds-btn-h,44px)] !text-[length:var(--kds-fs-btn,14px)] font-bold border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-700"
				@click="onMainPress"
				:loading="loading"
			>
				{{ mainLabel }}
			</Button>

			<!-- Confirmation when Runner is active -->
			<!-- //// Neoffice — dark mode (task 46): the till's dark remap turns the amber tint dark and left the text `amber-800`, dark on dark (1.8:1); the dark ramp's warning colour reads at 5.9:1 -->
			<div v-if="showDeliveredConfirm" class="w-full p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
				<p class="text-xs text-amber-800 dark:text-ds-warning font-medium mb-2">{{ __("Runner is active. This will skip the Runner.") }}</p>
				<div class="flex gap-2">
					<Button size="sm" variant="subtle" @click="showDeliveredConfirm = false" class="flex-1">{{ __("Cancel") }}</Button>
					<Button size="sm" variant="solid" @click="confirmDelivered" class="flex-1">{{ __("Confirm") }}</Button>
				</div>
			</div>

			<!-- //// Neoffice — the slot of the print button (task 38a-1, ruling 127): a 44 px square that stands at the right of the main button, drawn only when the screen can print a copy of the ticket (task 44 will wire it; no printing happens here) -->
			<button v-if="canPrint && !showDeliveredConfirm" type="button" data-test="ticket-print"
				class="flex h-[var(--kds-btn-h,44px)] w-[var(--kds-btn-h,44px)] flex-none items-center justify-center rounded-lg border border-gray-300 text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-700"
				:aria-label="__('Print a copy of this ticket')" :title="__('Print a copy of this ticket')"
				@click.stop="emit('print', order)">
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 9V3h12v6M6 14h12v8H6z" />
				</svg>
			</button>
		</div>

		<!-- Items -->
		<!-- //// Neoffice — the dishes are the part of the ticket that scrolls (task 23). `ticket-scroll-area` holds the hint that -->
		<!-- //// more dishes follow (a fade and "+N lines") over the foot of the scrolling body: the hint cannot sit in the body -->
		<!-- //// itself, it would scroll away with the dishes. -->
		<div class="flex flex-1 flex-col min-h-0" data-test="ticket-scroll-area">
			<div class="relative flex flex-1 flex-col min-h-0">
				<div ref="bodyEl" class="flex-1 min-h-0 overflow-y-auto" :class="[TICKET_FRAME.body, KITCHEN_FRAME.body]" data-test="ticket-body"
					@scroll.passive="onBodyScroll">
					<div ref="linesEl">
						<template v-for="(batch, batchIdx) in groupedActiveItems" :key="'batch-' + batchIdx">
							<!-- Batch separator (show for 2nd batch onwards) -->
							<div v-if="batchIdx > 0" class="flex items-center gap-2 my-2 px-1">
								<div class="flex-1 border-t border-dashed border-orange-300 dark:border-orange-700"></div>
								<span class="text-[9px] font-bold text-orange-500 uppercase tracking-wider whitespace-nowrap">
									{{ __('Send') }} {{ batchIdx + 1 }}
								</span>
								<div class="flex-1 border-t border-dashed border-orange-300 dark:border-orange-700"></div>
							</div>
							<div v-for="(item, idx) in batch.items" :key="'b' + batchIdx + '-' + idx"
								class="relative" data-ticket-line
								:class="{ 'border-t border-gray-50 dark:border-gray-700': idx > 0 }">
								<!-- The whole dish is one touch target (a tap opens its status menu), at least 48 px high like the runner's lines -->
								<!-- //// Neoffice — a press state instead of a mouse-over one: the kitchen screen is a tablet (task 23) -->
								<!-- //// Neoffice — a DELIVERED dish is inert (task 42): what is done is done, so it is no touch target (no pointer, no pressed -->
								<!-- //// state, no menu). Its fade and its strike-through sit HERE, on the content of the dish, never on the wrapper above: the -->
								<!-- //// wrapper holds the status menu of a dish that has one, and an `opacity` makes a stacking context of its own, which -->
								<!-- //// trapped the menu's z-index, faded the menu to 40 % and painted it under the dishes after it. -->
								<div class="flex flex-col justify-center py-[var(--kds-py,3px)] rounded px-1 -mx-1"
									:class="[
										TICKET_FRAME.line,
										KITCHEN_FRAME.line,
										isDelivered(item)
											? 'cursor-default opacity-40 line-through'
											: 'cursor-pointer active:bg-gray-100 dark:active:bg-gray-700 transition-colors',
									]"
									data-test="ticket-line"
									@click="onLineTap(item, $event)">
									<!-- Item line: qty x name + item status badge -->
									<div class="flex justify-between items-start gap-1">
										<span class="text-gray-900 dark:text-gray-100">
											<span class="font-bold">{{ item.qty }}x</span> {{ item.item_name }}
										</span>
										<!-- //// Neoffice — no `cursor-pointer` of its own (task 42): the pill takes the dish's cursor, so a delivered dish's has none -->
										<span v-if="item.kds_status"
											class="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
											:class="itemStatusClass(item.kds_status)">
											{{ kitchenStatusLabel(item.kds_status, { takeaway: isTakeaway }) }}
										</span>
									</div>
									<!-- //// Neoffice — THREE KINDS of text, one look each, all the size of the dish's own text (task 38a-1, ruling 123: the information is as important -->
									<!-- //// as the dish, and it was pale grey and small). The OPTIONS are ink with an arrow; a REMARK or instruction is the accent, medium, with the "i"; -->
									<!-- //// an ALLERGY is the one red, bold, in a tinted strip of its own with a warning mark, so that it cannot be taken for a remark. Red is kept for -->
									<!-- //// allergies (it was any annotation). A remark is an allergy when it holds a word of the list (utils/kitchenTextKinds). Options and a plain remark -->
									<!-- //// share a line while they fit. -->
									<div v-if="optionsOf(item).length || (remarkOf(item) && !isAllergyRemark(item))" data-test="ticket-sub"
										class="mt-0.5 pl-4 leading-snug text-[length:var(--kds-fs-sub,12px)]">
										<span v-if="optionsOf(item).length" data-test="ticket-options" class="font-normal text-gray-900 dark:text-gray-100">
											<span aria-hidden="true">→</span> {{ optionsOf(item).join(', ') }}
										</span>
										<span v-if="remarkOf(item) && !isAllergyRemark(item)" data-test="ticket-remark" class="font-medium text-blue-700"
											:class="{ 'ml-2': optionsOf(item).length }">
											<svg data-icon="info" class="inline-block h-[1em] w-[1em] align-[-0.14em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
											{{ remarkOf(item) }}
										</span>
									</div>
									<div v-if="remarkOf(item) && isAllergyRemark(item)" data-test="ticket-allergy"
										class="mt-0.5 ml-4 flex items-start gap-1 rounded-md border-l-4 border-red-500 bg-red-50 px-1.5 py-0.5 font-bold leading-snug text-red-700 text-[length:var(--kds-fs-sub,12px)] dark:text-ds-danger-soft">
										<svg data-icon="warning" class="mt-[0.15em] h-[1em] w-[1em] flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4M12 17h.01" /></svg>
										<span>{{ remarkOf(item) }}</span>
									</div>
									<!-- Station badge -->
									<!-- //// Neoffice — dark mode (task 46): white on a station's colour suits a light station in light mode only (white on clay is 2.8:1). In dark the text is whichever of white and ink reads on THAT colour, handed to the class as a variable (a colour in an inline style cannot be reached by a class). Light mode keeps `text-white`. -->
									<span v-if="showStationBadge && item.preparation_station"
										class="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white dark:text-[color:var(--station-ink)] mt-0.5 ml-4 inline-block self-start"
										:style="{ backgroundColor: getStationColor(item.preparation_station), '--station-ink': inkOn(getStationColor(item.preparation_station)) }">
										{{ item.station_name || item.preparation_station }}
									</span>
								</div>
								<!-- Item context menu -->
								<!-- //// Neoffice — was `absolute` under the dish, inside the ticket: the dishes now scroll inside the ticket, -->
								<!-- //// and a menu inside a scrolling body is cut by its foot. It is `fixed` and placed on the screen by -->
								<!-- //// utils/menuPlacement, and its buttons are 44 px high for a finger (task 23). -->
								<!-- //// Neoffice — the "Ready" entry takes the dark ramp's green in dark mode (task 46): `text-green-700` on the dark menu was 3.0:1 -->
								<!-- //// Neoffice — never for a delivered dish (task 42), even if a refresh delivers it while its menu is open -->
							<!-- //// Neoffice — the menu offers the statuses the station's last action allows (task 38a-1, ruling 112): with a runner the cook goes as far as -->
							<!-- //// "ready" and has no "deliver"; with none "ready" and "deliver" are one gesture, so the menu has "deliver" and no "ready"; from the list of -->
							<!-- //// what waits at the pass a dish can only be called back to preparation. -->
								<div v-if="activeItemMenu === item._globalIdx && !isDelivered(item)" data-test="ticket-line-menu"
									class="fixed z-30 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-1"
									:style="menuStyle">
									<button v-if="offers(item, 'Preparing')"
										@click.stop="updateItemStatus(item, 'Preparing')"
										class="w-full min-h-[44px] text-left px-3 text-sm font-medium text-blue-700 active:bg-blue-50 dark:active:bg-blue-900/30 flex items-center gap-2">
										<span class="w-2 h-2 rounded-full bg-blue-400"></span>
										{{ kitchenStatusLabel("Preparing") }}
									</button>
									<button v-if="offers(item, 'Ready')"
										@click.stop="updateItemStatus(item, 'Ready')"
										class="w-full min-h-[44px] text-left px-3 text-sm font-medium text-green-700 dark:text-ds-success active:bg-green-50 dark:active:bg-green-900/30 flex items-center gap-2">
										<span class="w-2 h-2 rounded-full bg-green-500"></span>
										{{ kitchenActionLabel("ready", { takeaway: isTakeaway }) }}
									</button>
									<button v-if="offers(item, 'Delivered')"
										@click.stop="updateItemStatus(item, 'Delivered')"
										class="w-full min-h-[44px] text-left px-3 text-sm font-medium text-gray-600 active:bg-gray-50 dark:active:bg-gray-700 flex items-center gap-2">
										<span class="w-2 h-2 rounded-full bg-gray-400"></span>
										{{ kitchenActionLabel("deliver", { takeaway: isTakeaway }) }}
									</button>
								</div>
							</div>
						</template>
						<!-- Waiting Items (ordered but not yet sent — preview for the cook) -->
						<!-- //// Neoffice — dark mode (task 46): the preview of dishes not sent yet is dimmed to 50 %, which on a dark card left it at 2.2:1; 75 % keeps it dimmer than a live dish and at 3:1 or more -->
						<div v-if="waitingItems.length > 0" class="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700">
							<h4 class="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 mb-2 tracking-wider flex items-center gap-1">
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
								{{ __("Coming Next") }}
							</h4>
							<div v-for="(item, idx) in waitingItems" :key="'w-' + idx"
								class="py-1.5 opacity-50 dark:opacity-75" data-ticket-line
								:class="{ 'border-t border-gray-50 dark:border-gray-700': idx > 0 }">
								<div class="flex justify-between items-start gap-1 px-1 -mx-1">
									<span class="text-sm text-gray-500 dark:text-gray-400 leading-tight">
										<span class="font-bold">{{ item.qty }}x</span> {{ item.item_name }}
									</span>
								</div>
								<div v-if="item.posa_special_instructions"
									class="text-xs text-blue-400 mt-0.5 pl-4">
									{{ item.posa_special_instructions }}
								</div>
							</div>
						</div>
					</div>
				</div>
				<!-- //// Neoffice — the hint that more dishes follow (task 23, redone in task 38a-1): a short fade over the foot of the dishes, which takes no touch, -->
				<!-- //// and below the dishes a thin strip that says how many are out of sight. The strip moved from the foot of the card, where it sat under the main -->
				<!-- //// button, to its own line under the dishes: the button is at the top now (ruling 107), so nothing else is at the bottom of the card, and the -->
				<!-- //// strip exists only while dishes are hidden. It is no longer drawn over the dishes at all (it once covered the status of the last one). -->
				<div v-if="hiddenCount > 0" aria-hidden="true" data-test="ticket-more-fade"
					class="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-white to-transparent dark:from-gray-800"></div>
			</div>
			<div v-if="hiddenCount > 0" data-test="ticket-more-strip"
				class="flex h-6 flex-shrink-0 items-center justify-end border-t border-gray-100 px-3 dark:border-gray-700">
				<span data-test="ticket-more"
					class="pointer-events-none rounded-full bg-gray-800 px-2.5 py-[3px] text-xs font-bold leading-none text-white dark:bg-white dark:text-gray-800">
					{{ hiddenCount === 1 ? __("+{0} line", [1]) : __("+{0} lines", [hiddenCount]) }}
				</span>
			</div>
		</div>

	</div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue"
import { Button } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import { useRestaurantStore } from "@/stores/restaurant"
import { kitchenStatusOf } from "@/utils/kitchenBands"
//// Neoffice — a badge says the state, a button says the action (task 38a-1, ruling 113)
import { kitchenActionLabel, kitchenStatusLabel } from "@/utils/kitchenStatus"
//// Neoffice — the room's short code on the header's line (task 38a-1)
import { roomCode } from "@/utils/kitchenRoomCode"
//// Neoffice — the three kinds of text of a dish: options, remark, allergy (task 38a-1, ruling 123)
import { allergyWordsOf, isAllergy } from "@/utils/kitchenTextKinds"
import { KITCHEN_FRAME, TICKET_FRAME } from "@/utils/ticketLayout"
//// Neoffice — what to write on a station's colour in dark mode (task 46)
import { inkOn } from "@/utils/stationColors"
//// Neoffice — the long ticket's hint and the status menu's place (task 23)
import { placeMenu } from "@/utils/menuPlacement"
import { hiddenLines } from "@/utils/ticketScrollHints"

// Strip HTML tags from a string
function stripHtml(html) {
	if (!html) return ""
	return html.replace(/<[^>]*>/g, "").trim()
}

const props = defineProps({
	order: {
		type: Object,
		required: true,
	},
	stations: {
		type: Array,
		default: () => [],
	},
	showStationBadge: {
		type: Boolean,
		default: true,
	},
	//// Neoffice — the station the screen is opened on (a tablet at the bar, or the station chosen on the screen), none for
	//// "all". The main button then acts on THAT station's dishes only: the server moves those and no others (task 23, fix
	//// round 1, ruling 79). The dishes this card is given are that station's own, the server sends no others.
	station: {
		type: String,
		default: null,
	},
	//// Neoffice — what to call once the server has answered (fix round 1). A press that moves the ticket to the other band
	//// unmounts this card before the answer, and Vue drops the events of a component that is gone: the band hands over a
	//// function, which still runs, and the screen reads the orders again at once instead of waiting for its 15 s poll.
	refresh: {
		type: Function,
		default: null,
	},
	//// Neoffice — the room of the table, as the restaurant names it (« Salle 1 »): the header shows its short code (task 38a-1,
	//// ruling 126). The screen knows the rooms, the order only carries the link; none, no chip.
	roomName: {
		type: String,
		default: "",
	},
	//// Neoffice — write the ticket's state beside its timer (placement A of ruling 126), for a screen that MIXES states. A band that
	//// names its state does not: the left border and the band's title carry it, and the header gains a line's worth of room.
	showState: {
		type: Boolean,
		default: false,
	},
	//// Neoffice — the dishes of this ticket go through a runner (ruling 112, task 38a-1; the page works it out from the stations, see utils/kitchenRunner).
	//// True (the default, as the station setting is): the cook's last action is "Ready", a runner delivers. False: the cook delivers, and
	//// "Ready" then "Delivered" are ONE gesture, a button "Deliver" on a dish that is being prepared.
	useRunner: {
		type: Boolean,
		default: true,
	},
	//// Neoffice — "kitchen" (the default), or "ready-list" for the list of what waits at the pass: the card then holds the ready dishes only, its
	//// main button calls them back to preparation, and a dish's menu offers nothing else (task 38a-1, ruling 112)
	mode: {
		type: String,
		default: "kitchen",
	},
	//// Neoffice — the screen can print a copy of the ticket (task 44, ruling 127): the 44 px print button stands at the right of the
	//// main button. False until that task wires it, so nothing is drawn.
	canPrint: {
		type: Boolean,
		default: false,
	},
})

const emit = defineEmits(["status-updated", "print"])
const { showError } = useToast()
const restaurantStore = useRestaurantStore()
const loading = ref(false)
const showDeliveredConfirm = ref(false)
const activeItemMenu = ref(null)
//// Neoffice — a takeaway is handed over, not delivered to a table (task 38a-1)
const isTakeaway = computed(() => !!props.order.is_takeaway)

//// Neoffice — the action of the main button (task 38a-1, ruling 112). It follows the dishes the ticket shows and their station: Start; on a
//// ticket being cooked, Ready when a runner carries the dishes on, Deliver when the cook does; Deliver on a ticket that is ready; from
//// the list of what waits at the pass, a call-back to preparation. A delivered ticket has no button.
const mainAction = computed(() => {
	if (props.mode === "ready-list") return "recall"
	switch (status.value) {
		case "Pending":
			return "start"
		case "Preparing":
			return props.useRunner ? "ready" : "deliver"
		case "Ready":
			return "deliver"
		default:
			return null
	}
})
// The three actions that move the cook along are the ink button; delivering a ticket already ready, and the call-back, are its outline
const inkAction = computed(
	() =>
		mainAction.value === "start" ||
		mainAction.value === "ready" ||
		(mainAction.value === "deliver" && status.value === "Preparing"),
)
const outlineAction = computed(
	() =>
		mainAction.value === "recall" ||
		(mainAction.value === "deliver" && status.value !== "Preparing"),
)
const mainLabel = computed(() =>
	kitchenActionLabel(mainAction.value, { takeaway: isTakeaway.value }),
)

//// Neoffice — what the header's line shows besides the table (task 38a-1, rulings 122, 125, 126). The room's code is derived here for now
//// (utils/kitchenRoomCode; the server will send its own, task 38b); a takeaway has no room, its label says it. The number is the ticket's
//// `ticket_no` when the order carries one, for a takeaway the counter it has had until then; the Sales Invoice's own name is NEVER a
//// ticket number (a draft gets it at its first save, in an order nobody asked for), so an order with none shows no number at all.
const roomChip = computed(() =>
	isTakeaway.value ? "" : roomCode(props.roomName),
)
const ticketNumber = computed(() =>
	String(
		props.order.ticket_no ||
			(isTakeaway.value ? props.order.takeaway_number : "") ||
			"",
	),
)

// Separate items into active (sent to kitchen) vs waiting (not yet sent)
const activeItems = computed(() =>
	(props.order.items || []).filter(
		(i) => i.kds_status && i.kds_status !== "Waiting",
	),
)

// Group active items by kds_batch for visual separation of successive sends
const groupedActiveItems = computed(() => {
	const items = activeItems.value.map((item, idx) => ({ ...item, _globalIdx: idx }))
	const batchMap = new Map()
	for (const item of items) {
		const batch = item.kds_batch || 0
		if (!batchMap.has(batch)) batchMap.set(batch, [])
		batchMap.get(batch).push(item)
	}
	// Sort by batch number ascending
	const sorted = [...batchMap.entries()].sort((a, b) => a[0] - b[0])
	return sorted.map(([batch, batchItems]) => ({ batch, items: batchItems }))
})
const waitingItems = computed(() =>
	(props.order.items || []).filter((i) => i.kds_status === "Waiting"),
)

//// Neoffice — the status the ticket shows, from the DISHES it shows (fix round 1, ruling 78). The order's own status is not
//// it: `update_item_kds_status` leaves it alone until every dish is ready, so an order whose dishes are being cooked says
//// "Pending" (with several stations, every day) and the ticket kept its yellow border, its PENDING badge and its Start
//// button in the "in preparation" band. The same rule as the band's (utils/kitchenBands): none begun, Pending and Start;
//// one begun, Preparing and Ready; all ready, Ready and Delivered.
const status = computed(() => kitchenStatusOf(props.order))

//// Neoffice — what to do once the server has answered (fix round 1): see the `refresh` prop
function changed() {
	if (props.refresh) props.refresh()
	else emit("status-updated")
}

//// Neoffice — the status menu of a dish opens ON THE SCREEN, not inside the ticket (task 23). Upstream of this file's
//// first version it hung under the dish (`absolute`); the dishes now scroll inside the ticket and the foot of the
//// scrolling body would cut it. It is 160 px wide (w-40); each button is 44 px high, and the menu has a button for every
//// status the dish is not at (a dish being prepared has two, a dish waiting three), 10 px of padding and borders besides:
//// the room it needs, and where it hangs from when it opens upward, are those of the menu it really is (fix round 1).
const MENU_WIDTH = 160
const MENU_BUTTON_HEIGHT = 44
const MENU_FRAME_HEIGHT = 10
const MENU_STATUSES = ["Preparing", "Ready", "Delivered"]
const menuPosition = ref({ left: 0, top: 0 })
const menuStyle = computed(() => {
	const { left, top, bottom } = menuPosition.value
	return {
		left: `${left}px`,
		...(top !== undefined ? { top: `${top}px` } : { bottom: `${bottom}px` }),
	}
})

//// Neoffice — which statuses a dish's menu offers (task 38a-1, ruling 112). Never the one it is at.
function offers(item, status) {
	if (item.kds_status === status) return false
	if (props.mode === "ready-list") return status === "Preparing"
	// A dish that is Ready already, or one the cook delivers himself, has no "ready" to press for a station without a runner
	if (status === "Ready") return props.useRunner
	// With a runner the cook has no "deliver": the runner delivers
	if (status === "Delivered") return !props.useRunner
	return true
}

//// Neoffice — a delivered dish is done (task 42): its tap does nothing, no menu, no call, and nothing to put it back
//// (coming back is a separate, deliberate act, not a tap on a struck-through line)
function isDelivered(item) {
	return item.kds_status === "Delivered"
}

//// Neoffice — the tap on a dish (task 42). The tap of a dish that has a menu stops here (the click on the page would close the
//// menu it has just opened). The tap of a delivered dish is not taken: it goes on to the page, which closes a menu left open.
function onLineTap(item, event) {
	if (isDelivered(item)) return
	event.stopPropagation()
	toggleItemMenu(item, event)
}

function toggleItemMenu(item, event) {
	if (isDelivered(item)) return
	const idx = item._globalIdx
	if (activeItemMenu.value === idx) {
		activeItemMenu.value = null
		return
	}
	const anchor = event?.currentTarget?.getBoundingClientRect?.()
	if (anchor) {
		const buttons = MENU_STATUSES.filter((s) => offers(item, s)).length
		menuPosition.value = placeMenu(
			anchor,
			{
				width: MENU_WIDTH,
				height: buttons * MENU_BUTTON_HEIGHT + MENU_FRAME_HEIGHT,
			},
			{ width: window.innerWidth, height: window.innerHeight },
		)
	}
	activeItemMenu.value = idx
}

// A menu on the screen does not follow its dish: when anything scrolls (the ticket's dishes, the lane of tickets) it closes.
// A scroll does not bubble, so the listener sits on the window in the capture phase. It is there only while a menu is
// open: forty-five tickets must not all listen to every scroll of the page.
const closeMenu = () => {
	activeItemMenu.value = null
}
watch(activeItemMenu, (open) => {
	if (open !== null)
		window.addEventListener("scroll", closeMenu, { capture: true, passive: true })
	else window.removeEventListener("scroll", closeMenu, { capture: true })
})

//// Neoffice — a refresh that delivers the dish whose menu is open closes that menu for good (task 42). The template already
//// hides the menu of a delivered dish, but `activeItemMenu` kept the dish's index: if a later refresh brought the dish back
//// to a live status, the menu would reappear with nobody having touched the screen. Forgetting it here closes it the way
//// every other close does (and takes the page-scroll listener off with it).
watch(
	() => {
		const open = activeItemMenu.value
		return open !== null && activeItems.value[open]?.kds_status === "Delivered"
	},
	(delivered) => {
		if (delivered) closeMenu()
	},
)

//// Neoffice — how many dishes are cut by the foot of the ticket (task 23). Read from the boxes on the screen, so it follows
//// the scroll, the size of the band the ticket is in (a tablet turned, a layout chosen) and the dishes a refresh brings.
const bodyEl = ref(null)
const linesEl = ref(null)
const hiddenCount = ref(0)
function measureHidden() {
	hiddenCount.value = hiddenLines(bodyEl.value)
}
function onBodyScroll() {
	activeItemMenu.value = null
	measureHidden()
}
let sizeObserver = null
watch(() => props.order, measureHidden, { deep: true, flush: "post" })

// Update individual item KDS status (optimistic UI)
async function updateItemStatus(item, newStatus) {
	activeItemMenu.value = null
	// Optimistic: update all items with same item_code instantly
	const oldStatuses = []
	props.order.items.forEach((i) => {
		if (i.item_code === item.item_code) {
			oldStatuses.push(i.kds_status)
			i.kds_status = newStatus
		}
	})
	try {
		await call("pos_next.api.restaurant.update_item_kds_status", {
			invoice_name: props.order.name,
			item_code: item.item_code,
			status: newStatus,
		})
		changed()
	} catch (error) {
		// Rollback on error
		let idx = 0
		props.order.items.forEach((i) => {
			if (i.item_code === item.item_code) {
				i.kds_status = oldStatuses[idx++]
			}
		})
		showError(__("Failed to update item status"))
	}
}

// Close menu when clicking outside
function handleDocClick() {
	activeItemMenu.value = null
}

// Timer: update every second
const now = ref(new Date())
let timerInterval = null

onMounted(() => {
	timerInterval = setInterval(() => {
		now.value = new Date()
	}, 1000)
	document.addEventListener("click", handleDocClick)
	//// Neoffice — measure the foot of the ticket now, and again whenever its body or its dishes change size (task 23)
	measureHidden()
	if (typeof ResizeObserver !== "undefined") {
		sizeObserver = new ResizeObserver(() => measureHidden())
		if (bodyEl.value) sizeObserver.observe(bodyEl.value)
		if (linesEl.value) sizeObserver.observe(linesEl.value)
	}
})

onUnmounted(() => {
	if (timerInterval) clearInterval(timerInterval)
	document.removeEventListener("click", handleDocClick)
	//// Neoffice — see the watcher of the menu and the size observer above (task 23)
	window.removeEventListener("scroll", closeMenu, { capture: true })
	sizeObserver?.disconnect()
})

// Time since last action (modified)
const lastActionTime = computed(
	() => new Date(props.order.modified || props.order.creation),
)
const lastActionMinutes = computed(() =>
	Math.floor((now.value - lastActionTime.value) / 60000),
)
const lastActionSeconds = computed(() =>
	Math.floor(((now.value - lastActionTime.value) % 60000) / 1000),
)
const elapsedTime = computed(() => {
	const min = lastActionMinutes.value.toString().padStart(2, "0")
	const sec = lastActionSeconds.value.toString().padStart(2, "0")
	return `${min}:${sec}`
})

// Total time since table was opened (creation)
const totalTime = computed(() => {
	const total = now.value - new Date(props.order.creation)
	const min = Math.floor(total / 60000)
		.toString()
		.padStart(2, "0")
	const sec = Math.floor((total % 60000) / 1000)
		.toString()
		.padStart(2, "0")
	return `${min}:${sec}`
})
const elapsedMinutes = lastActionMinutes

// Timer color: red+pulse >15min, orange >10min, green if ready
//// Neoffice — dark mode (task 46): `red-600` and `orange-500` are for a light card (3.1:1 and 4.1:1 on a dark one), and `animate-pulse` halves
//// the opacity, which took the late timer to 1.6:1 at its dimmest. In dark the late timer is the dark ramp's lighter red and pulses by
//// colour and glow (`late-pulse`, tailwind.config.js) so that no moment of the blink is dim; a slow one is the lighter orange. Green is left.
const timeColorClass = computed(() => {
	if (status.value === "Ready") return "text-green-600"
	if (elapsedMinutes.value > 15)
		return "text-red-600 animate-pulse dark:text-ds-danger dark:animate-late-pulse"
	if (elapsedMinutes.value > 10) return "text-orange-500 dark:text-ds-warning"
	return "text-gray-800 dark:text-gray-200"
})

// Left border color based on order status
const borderColorClass = computed(() => {
	switch (status.value) {
		case "Pending":
			return "border-yellow-400"
		case "Preparing":
			return "border-blue-400"
		case "Ready":
			return "border-green-500"
		default:
			return "border-gray-300"
	}
})

// Status badge styling for the order header
//// Neoffice — dark mode (task 46): the till's dark remap lightens the TEXT of `text-blue-800` (to clay-200) and leaves `bg-blue-200` as the
//// same clay-200: the "In preparation" badge was a blank patch (1.0:1). In dark it takes the clay tint the dishes' own badge already has.
const statusBadgeClass = computed(() => {
	switch (status.value) {
		case "Pending":
			return "bg-yellow-200 text-yellow-800"
		case "Preparing":
			return "bg-blue-200 text-blue-800 dark:bg-blue-400/25"
		case "Ready":
			return "bg-green-200 text-green-800"
		default:
			return "bg-gray-200 text-gray-800"
	}
})

// Status badge styling for individual items
function itemStatusClass(status) {
	switch (status) {
		case "Pending":
			return "bg-yellow-100 text-yellow-800"
		case "Preparing":
			return "bg-blue-100 text-blue-800"
		case "Ready":
			//// Neoffice — dark mode (task 46): the dark remap tints `bg-green-100` dark green and `text-green-800` stayed dark green on it (1.3:1)
			return "bg-green-100 text-green-800 dark:text-ds-success-soft"
		case "Delivered":
			return "bg-gray-100 text-gray-800"
		default:
			return "bg-gray-100 text-gray-600"
	}
}

// Look up station color from stations array prop
function getStationColor(stationName) {
	const station = props.stations.find((s) => s.name === stationName)
	return station?.color || "#6B7280"
}

//// Neoffice — the remark of a dish, trimmed, and whether it is an allergy: the restaurant's own list of words when its settings carry one
//// (`allergy_words`), else the default (task 38a-1, ruling 123)
const allergyWords = computed(() =>
	allergyWordsOf(restaurantStore.restaurantSettings),
)
const remarkOf = (item) => String(item.posa_special_instructions || "").trim()
const isAllergyRemark = (item) => isAllergy(remarkOf(item), allergyWords.value)
const optionsOf = (item) =>
	item.posa_item_modifiers ? parseModifiers(item.posa_item_modifiers) : []

// Parse modifier JSON into a flat list of modifier option names
function parseModifiers(json) {
	try {
		const mods = JSON.parse(json)
		return mods.flatMap((m) => m.options.map((o) => o.name))
	} catch {
		return []
	}
}

// Update order KDS status via API
// Update order-level KDS status (optimistic UI)
async function updateStatus(newStatus) {
	// Confirmation when marking as Delivered with Runner active
	//// Neoffice — only for a station that HAS a runner (task 38a-1, ruling 112): a station without one is delivered by the cook, by design
	if (newStatus === "Delivered" && restaurantStore.runnerEnabled && props.useRunner) {
		showDeliveredConfirm.value = true
		return
	}
	await doUpdateStatus(newStatus)
}

async function confirmDelivered() {
	showDeliveredConfirm.value = false
	await doUpdateStatus("Delivered")
}

function onMainPress() {
	switch (mainAction.value) {
		case "start":
			return updateStatus("Preparing")
		case "ready":
			return updateStatus("Ready")
		case "deliver":
			return updateStatus("Delivered")
		case "recall":
			return recall()
	}
}

//// Neoffice — the call-back to preparation, from the list of what waits at the pass (task 38a-1, ruling 112): every dish of the card, one
//// call each (the server moves the lines of one item at a time, and moves them back as well as forward), at once on screen, put back
//// if the server refuses
async function recall() {
	loading.value = true
	const dishes = (props.order.items || []).filter(
		(dish) => dish.kds_status === "Ready",
	)
	const before = dishes.map((dish) => dish.kds_status)
	for (const dish of dishes) dish.kds_status = "Preparing"
	try {
		for (const code of new Set(dishes.map((dish) => dish.item_code))) {
			await call("pos_next.api.restaurant.update_item_kds_status", {
				invoice_name: props.order.name,
				item_code: code,
				status: "Preparing",
			})
		}
		changed()
	} catch (error) {
		dishes.forEach((dish, index) => {
			dish.kds_status = before[index]
		})
		showError(__("Failed to update item status"))
	} finally {
		loading.value = false
	}
}

//// Neoffice — the statuses a dish goes through, in order (as the server ranks them)
const RANK = { Pending: 0, Preparing: 1, Ready: 2, Delivered: 3 }

//// Neoffice — what the server does to the dishes when a status is pressed, done here at once (fix round 1): never backward,
//// and a dish held back (Waiting) is not the cook's to advance. The ticket's look follows its dishes, so this is what
//// turns Start into Ready under the finger; and it moves the ticket to the other band without waiting for a round trip.
function advanceDishes(newStatus) {
	const rank = RANK[newStatus] ?? 0
	for (const dish of props.order.items || []) {
		if (
			dish.kds_status &&
			dish.kds_status !== "Waiting" &&
			(RANK[dish.kds_status] ?? 0) < rank
		)
			dish.kds_status = newStatus
	}
}

async function doUpdateStatus(newStatus) {
	loading.value = true
	// Optimistic: update instantly, and put back what was there if the server refuses
	const before = {
		order: props.order.kds_status,
		dishes: (props.order.items || []).map((dish) => dish.kds_status),
	}
	advanceDishes(newStatus)
	// With every station the server gives the order the status asked. With a station it makes the order follow its dishes,
	// those of every station, which this screen does not see: the order is left to the server, the look follows the dishes
	if (!props.station) props.order.kds_status = newStatus
	try {
		await call("pos_next.api.restaurant.update_kds_status", {
			invoice_name: props.order.name,
			status: newStatus,
			...(props.station ? { station: props.station } : {}),
		})
		changed()
	} catch (error) {
		// Rollback on error
		;(props.order.items || []).forEach((dish, index) => {
			dish.kds_status = before.dishes[index]
		})
		props.order.kds_status = before.order
		showError(__("Failed to update KDS order status."))
	} finally {
		loading.value = false
	}
}
</script>

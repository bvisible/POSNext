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
	<!-- //// Neoffice — the card has TWO forms (task 38a-3, ruling 107 layer 3): the card of the board, and the same ticket opened FULL SCREEN over it (`fullscreen`), which the board's card draws by rendering itself -->
	<!-- //// inside TicketFullScreen. One component, so the dishes, the buttons, the menus and the calls are written once and the two can never disagree. The panel is bigger (its own CSS variables, `fullScreenVariables`), -->
	<!-- //// has an × beside its buttons, and lays its dishes out in columns side by side. -->
	<div class="bg-white dark:bg-gray-800 flex flex-1 flex-col min-h-0"
		:class="[borderColorClass, fullscreen ? 'rounded-2xl border-l-[6px] overflow-hidden shadow-xl' : 'rounded-xl shadow-sm border-l-4 max-h-[var(--ticket-max-h,none)]']"
		:style="fullscreen ? fullVariables : undefined"
		:data-test="fullscreen ? 'ticket-panel' : 'ticket'" :data-state="status">

		<!-- Header -->
		<!-- The frame (padding, title, order number, timer, dish lines) is the one the runner ticket has: utils/ticketLayout -->
		<!-- //// Neoffice — the header is ONE line (task 38a-1, rulings 125 and 126): the room's code as a small chip, the TABLE big and bold, the ticket's -->
		<!-- //// number, the timer at the right. The invoice's own name is never shown here (ruling 122: a draft takes its Sales Invoice number at the -->
		<!-- //// first save, so it is no ticket number: it is shown only once the sale is validated). The ticket number is `ticket_no` when the order -->
		<!-- //// carries one (the server fills it in with the ticket counter), and for a takeaway the counter it has had until then. The state is NOT -->
		<!-- //// written here: the left border and the band the card stands in carry it. `showState` writes it beside the timer for a screen that mixes -->
		<!-- //// the states (placement A of ruling 126). The second timer, the table's total time, shows only in the large sizes. -->
		<div ref="headerEl" class="flex-shrink-0 border-b border-gray-100 dark:border-gray-700" :class="[TICKET_FRAME.header, KITCHEN_FRAME.header]" data-test="ticket-header">
			<div class="flex items-center justify-between gap-x-1.5">
				<div ref="refEl" class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5" data-test="ticket-ref">
					<span v-if="roomChip" data-test="ticket-room"
						class="rounded-md bg-gray-100 px-1.5 text-[length:var(--kds-fs-ref,11px)] font-semibold leading-snug tracking-wide text-gray-600 dark:bg-gray-700">
						{{ roomChip }}
					</span>
					<h3 ref="titleEl" data-test="ticket-title" class="whitespace-nowrap text-gray-900 dark:text-white" :class="[TICKET_FRAME.title, KITCHEN_FRAME.title]">
						<template v-if="order.is_takeaway">{{ __("Takeaway") }}</template>
						<template v-else>{{ order.table_display_name || order.restaurant_table }}</template>
					</h3>
					<span v-if="ticketNumber" data-test="ticket-number" class="text-gray-500 font-medium tabular-nums" :class="[TICKET_FRAME.number, KITCHEN_FRAME.number]">
						{{ order.is_takeaway ? "· " : "" }}{{ ticketNumber }}
					</span>
					<!-- //// Neoffice — the panel says in words where the ticket stands and how long it is (the mockup's « En préparation · 21 lignes »): the card has its border and its band for the state -->
					<span v-if="fullscreen" data-test="ticket-fs-state" class="font-semibold text-[length:var(--kds-fs-ref,11px)]" :class="stateTextClass">
						{{ kitchenStatusLabel(status, { takeaway: isTakeaway }) }} · {{ lineCountLabel }}
					</span>
				</div>
				<div class="flex flex-none items-baseline gap-1.5">
					<!-- //// Neoffice — the badge keeps the classes the dark mode gave it (task 46); it is drawn only where states mix -->
					<span v-if="showState" class="text-[10px] uppercase font-bold tracking-wider rounded-full px-2 py-0.5 self-center"
						data-test="ticket-status" :class="statusBadgeClass">
						{{ kitchenStatusLabel(status, { takeaway: isTakeaway }) }}
					</span>
					<span v-show="!totalGivesWay" class="font-mono tabular-nums text-gray-400 whitespace-nowrap [display:var(--kds-tt-d,none)] text-[length:var(--kds-fs-tt,10px)]"
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
		<div class="flex flex-shrink-0 items-stretch border-b border-gray-100 dark:border-gray-700" :class="fullscreen ? FULLSCREEN_FRAME.actions : 'gap-1.5 px-2 pb-2 pt-0.5'" data-test="ticket-actions">
			<!-- //// Neoffice — ONE main button, whose action follows the ticket and its station (task 38a-1, ruling 112): Start on a ticket to start; on a ticket being -->
			<!-- //// cooked, "Ready" when a runner carries the dishes on and "Deliver" when the cook does (one gesture, no "Ready" between); "Deliver" on a ticket that is -->
			<!-- //// ready; from the list of what waits at the pass, a call-back to preparation. The first three are the ink button, the others its outline. -->
			<Button
				v-if="inkAction"
				variant="solid"
				size="lg"
				data-test="ticket-main"
				class="min-w-0 flex-1 !h-[var(--kds-btn-h,44px)] !text-[length:var(--kds-fs-btn,14px)] font-bold text-white dark:enabled:text-ink-white"
				:class="fullscreen ? 'max-w-[520px]' : ''"
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
				:class="fullscreen ? 'max-w-[520px]' : ''"
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

			<!-- //// Neoffice — the way out of the panel, at the right of the buttons, 56 px square (task 38a-3, ruling 107): a tap outside the panel and Escape close it too (TicketFullScreen) -->
			<button v-if="fullscreen" type="button" data-test="ticket-close"
				class="ml-auto flex h-[var(--kds-btn-h,44px)] w-[var(--kds-btn-h,44px)] flex-none items-center justify-center rounded-lg border border-gray-300 text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-700"
				:aria-label="__('Close')" :title="__('Close')"
				@click="emit('close')">
				<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6 6 18M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Items -->
		<!-- //// Neoffice — the dishes are the part of the ticket that scrolls (task 23). `ticket-scroll-area` holds the hint that -->
		<!-- //// more dishes follow (a fade and "+N lines") over the foot of the scrolling body: the hint cannot sit in the body -->
		<!-- //// itself, it would scroll away with the dishes. -->
		<div class="flex flex-1 flex-col min-h-0" data-test="ticket-scroll-area">
			<div class="relative flex flex-1 flex-col min-h-0">
				<!-- //// Neoffice — in the panel the dishes flow in COLUMNS side by side and the body scrolls sideways (task 38a-3, ruling 107); `contents` takes the list's wrapper out of the box tree so that the dishes are the columns' own children -->
				<div ref="bodyEl" class="flex-1 min-h-0" :class="[fullscreen ? FULLSCREEN_FRAME.body : 'overflow-y-auto', TICKET_FRAME.body, KITCHEN_FRAME.body]" data-test="ticket-body"
					@scroll.passive="onBodyScroll">
					<div ref="linesEl" :class="fullscreen ? 'contents' : undefined">
						<template v-for="(batch, batchIdx) in groupedActiveItems" :key="'batch-' + batchIdx">
							<!-- Batch separator (show for 2nd batch onwards) -->
							<div v-if="batchIdx > 0" class="flex items-center gap-2 my-2 px-1" :class="fullscreen ? 'break-inside-avoid' : ''">
								<div class="flex-1 border-t border-dashed border-orange-300 dark:border-orange-700"></div>
								<span class="text-[9px] font-bold text-orange-500 uppercase tracking-wider whitespace-nowrap">
									<!-- //// Neoffice — the number of a send reads « Envoi 2 », not the button's « Envoyer 2 » (kitchen test, 01.11): its own context -->{{ __('Send', null, 'Kitchen send number') }} {{ batchIdx + 1 }}
								</span>
								<div class="flex-1 border-t border-dashed border-orange-300 dark:border-orange-700"></div>
							</div>
							<!-- //// Neoffice — the dishes of a send come in SECTIONS by family (Daniel, 01.11: « séparer entrée, plat, dessert »): `inSections` (utils/ticketFamilies) puts them in the order of the meal and tells the first dish of a labelled section (`_head`) and whether a faint rule goes above a dish (`_rule`: every dish but the first, and but the first under a label, whose label is the divider). The label stands INSIDE the wrapper of that first dish, so that in the full-screen columns it is never left alone at the foot of a column. A ticket with no family at all has no label and the rules it always had. -->
							<div v-for="(item, idx) in batch.items" :key="'b' + batchIdx + '-' + idx"
								class="relative" data-ticket-line
								:class="{ 'border-t border-gray-50 dark:border-gray-700': item._rule, 'break-inside-avoid': fullscreen }">
								<TicketSectionHeader v-if="item._head" :label="item._head.label" :family="item._head.family" />
								<!-- The whole dish is one touch target (a tap opens its status menu), at least 48 px high like the runner's lines -->
								<!-- //// Neoffice — a press state instead of a mouse-over one: the kitchen screen is a tablet (task 23) -->
								<!-- //// Neoffice — a DELIVERED dish is inert (task 42): what is done is done, so it is no touch target (no pointer, no pressed -->
								<!-- //// state, no menu). Its fade and its strike-through sit HERE, on the content of the dish, never on the wrapper above: the -->
								<!-- //// wrapper holds the status menu of a dish that has one, and an `opacity` makes a stacking context of its own, which -->
								<!-- //// trapped the menu's z-index, faded the menu to 40 % and painted it under the dishes after it. -->
								<div class="grid grid-cols-[2.1em_minmax(0,1fr)] content-center gap-x-1.5 py-[var(--kds-py,3px)] rounded px-1 -mx-1"
									:class="[
										TICKET_FRAME.line,
										fullscreen ? FULLSCREEN_FRAME.line : KITCHEN_FRAME.line,
										isDelivered(item)
											? 'cursor-default opacity-40 line-through'
											: 'cursor-pointer active:bg-gray-100 dark:active:bg-gray-700 transition-colors',
										isMenuOf(item) ? 'bg-[#FCF3EA] ring-2 ring-inset ring-[#D68A59] dark:bg-[#3A2C22]' : '',
										//// Neoffice — the pale tint of the dish's category (Daniel, 01.11): a variable on the row and the class that reads it, so that the pressed state above still wins over it. It steps aside for the highlight of the dish whose status menu is open.
										lineTint(item) ? TINT_CLASS : '',
									]"
									:style="lineTint(item)"
									:data-selected="isMenuOf(item) ? 'true' : undefined"
									data-test="ticket-line"
									@click="onLineTap(item, $event)">
									<!-- //// Neoffice — ONE row for the dish, nothing under it but its options, remark and allergy (task 38a-1, ruling 110 and the mockup): the quantity in its own -->
									<!-- //// column (a tint when there are several, so that « 3x » is seen from across the pass), then the name, preceded by the station's tag (in the view of ALL -->
									<!-- //// the stations only: the page hands `showStationBadge`) and by the dish's state WHEN IT IS NOT THE TICKET'S. The tag and the state used to take a line -->
									<!-- //// each under the dish, and a wide state pill beside the name made a long dish wrap onto a second line. A delivered dish carries a check mark. -->
									<!-- //// Neoffice — a line cooked in part shows the units STILL TO COOK as its quantity (kitchen test of 01.11: six ordered, four sent, « 2× » left to cook); the units that left are told by the pill after the name -->
									<span class="font-bold whitespace-nowrap self-start text-gray-900 dark:text-gray-100" data-test="ticket-qty"
										:class="Number(shownQty(item)) > 1 && !isDelivered(item) ? 'rounded bg-blue-100 px-1 -ml-1' : ''">{{ shownQty(item) }}×</span>
									<span class="font-medium text-gray-900 dark:text-gray-100 [overflow-wrap:anywhere]" data-test="ticket-dish-name">
										<!-- Station tag -->
										<!-- //// Neoffice — dark mode (task 46): white on a station's colour suits a light station in light mode only (white on clay is 2.8:1). In dark the text is whichever of white and ink reads on THAT colour, handed to the class as a variable (a colour in an inline style cannot be reached by a class). Light mode keeps `text-white`. -->
										<span v-if="showStationBadge && item.preparation_station" data-test="ticket-station-tag"
											class="mr-1.5 inline-block rounded-full px-1.5 align-[0.1em] text-[length:var(--kds-fs-ref,11px)] font-bold leading-[1.4] tracking-wide text-white dark:text-[color:var(--station-ink)]"
											:title="item.station_name || item.preparation_station"
											:style="{ backgroundColor: getStationColor(item.preparation_station), '--station-ink': inkOn(getStationColor(item.preparation_station)) }">{{ stationCode(item) }}</span>
										<!-- //// Neoffice — no `cursor-pointer` of its own (task 42): the pill takes the dish's cursor, so a delivered dish's has none -->
										<span v-if="stateWord(item)" data-test="ticket-line-state"
											class="mr-1.5 inline-block rounded-full px-1.5 align-[0.1em] text-[length:var(--kds-fs-ref,11px)] font-bold leading-[1.4] whitespace-nowrap"
											:class="itemStatusClass(item.kds_status)">{{ stateWord(item) }}</span>
										<!-- //// Neoffice — what already left of a line cooked in part, told by a small pill in the look of a delivered dish (struck through, faded): « 4 of 6 sent » (kitchen test of 01.11) -->
										<span v-if="isCookedInPart(item)" data-test="ticket-line-sent"
											class="mr-1.5 inline-block rounded-full px-1.5 align-[0.1em] text-[length:var(--kds-fs-ref,11px)] font-bold leading-[1.4] whitespace-nowrap line-through opacity-60 dark:opacity-75"
											:class="itemStatusClass('Delivered')">{{ __("{0} of {1} sent", [unitsSentOf(item), orderedQty(item)]) }}</span>
										<svg v-if="isDelivered(item)" data-test="ticket-line-done" data-icon="check" class="mr-1 inline-block h-[1em] w-[1em] align-[-0.14em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>{{ item.item_name }}
									</span>
									<!-- //// Neoffice — THREE KINDS of text, one look each, all the size of the dish's own text (task 38a-1, ruling 123): the options, a remark, an allergy. They are drawn by TicketDishNotes since the runner's card draws the same three (task 38a-2, ruling 130). -->
									<TicketDishNotes :item="item" :allergy-words="allergyWords" />
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
									class="fixed z-30 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-600 p-1.5"
									:class="pickerShown(item) ? 'w-60' : 'w-48'"
									:style="menuStyle">
									<!-- //// Neoffice — the menu names the dish it is for and the line is highlighted (kitchen test, 01.11): the menu opens under the dish and covers the one after it, so a cook could not tell which dish a button would act on. The buttons are a size and a weight up, with a border in the colour of the state, so that « ready » is read from across the pass. -->
									<p data-test="ticket-line-menu-dish" class="truncate px-1.5 pb-1.5 text-[length:var(--kds-fs-sub,12px)] font-semibold text-gray-500 dark:text-gray-400">{{ shownQty(item) }}× {{ item.item_name }}</p>
									<div class="flex flex-col gap-1">
										<button v-if="offers(item, 'Preparing')"
											@click.stop="updateItemStatus(item, 'Preparing')"
											class="w-full min-h-[48px] rounded-lg border-2 border-blue-300 bg-blue-50 px-3 text-left text-base font-bold text-blue-900 active:bg-blue-100 dark:border-blue-300/60 dark:bg-blue-400/20 dark:text-blue-100 flex items-center gap-2.5">
											<span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
											{{ kitchenStatusLabel("Preparing") }}
										</button>
										<!-- //// Neoffice — a line of several units left to cook gets a quantity beside « ready » (kitchen test of 01.11: six of the same dish, four are done): a stepper - n + that starts on ALL that is left, so that one tap on the button is what it always was. The button says how many it marks. -->
										<div v-if="pickerShown(item)" data-test="ticket-line-picker" class="flex items-center gap-1" role="group" :aria-label="__('Units ready')">
											<button type="button" data-test="picker-less" :disabled="pickedUnits <= 1" :aria-label="__('One less')"
												@click.stop="stepUnits(item, -1)"
												class="h-12 w-12 flex-none touch-manipulation rounded-lg border-2 border-gray-300 bg-gray-100 text-2xl font-bold leading-none text-gray-800 active:bg-gray-200 disabled:opacity-40 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-100">−</button>
											<span data-test="picker-count" aria-live="polite"
												class="min-w-0 flex-1 text-center text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{{ pickedUnits }}</span>
											<button type="button" data-test="picker-more" :disabled="pickedUnits >= unitsLeftOf(item)" :aria-label="__('One more')"
												@click.stop="stepUnits(item, 1)"
												class="h-12 w-12 flex-none touch-manipulation rounded-lg border-2 border-gray-300 bg-gray-100 text-2xl font-bold leading-none text-gray-800 active:bg-gray-200 disabled:opacity-40 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-100">+</button>
										</div>
										<button v-if="offers(item, 'Ready')"
											@click.stop="pressReady(item)"
											data-test="menu-ready"
											class="w-full min-h-[48px] rounded-lg border-2 border-green-600 bg-green-50 px-3 text-left text-base font-bold text-green-900 active:bg-green-100 dark:border-ds-success dark:bg-green-400/20 dark:text-ds-success flex items-center gap-2.5">
											<span class="w-2.5 h-2.5 flex-none rounded-full bg-green-600 dark:bg-ds-success"></span>
											{{ readyLabel(item) }}
										</button>
										<button v-if="offers(item, 'Delivered')"
											@click.stop="updateItemStatus(item, 'Delivered')"
											class="w-full min-h-[48px] rounded-lg border-2 border-gray-300 bg-gray-100 px-3 text-left text-base font-bold text-gray-800 active:bg-gray-200 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-100 flex items-center gap-2.5">
											<span class="w-2.5 h-2.5 rounded-full bg-gray-500"></span>
											{{ kitchenActionLabel("deliver", { takeaway: isTakeaway }) }}
										</button>
									</div>
								</div>
							</div>
						</template>
						<!-- Waiting Items (ordered but not yet sent — preview for the cook) -->
						<!-- //// Neoffice — dark mode (task 46): the preview of dishes not sent yet is dimmed to 50 %, which on a dark card left it at 2.2:1; 75 % keeps it dimmer than a live dish and at 3:1 or more -->
						<div v-if="waitingItems.length > 0" class="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700" :class="fullscreen ? 'break-inside-avoid' : ''">
							<h4 class="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 mb-2 tracking-wider flex items-center gap-1">
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
								{{ __("Coming Next") }}
							</h4>
							<div v-for="(item, idx) in waitingItems" :key="'w-' + idx"
								class="py-1.5 opacity-50 dark:opacity-75" data-ticket-line
								:class="{ 'border-t border-gray-50 dark:border-gray-700': idx > 0 }">
								<div class="flex justify-between items-start gap-1 px-1 -mx-1">
									<span class="text-[length:var(--kds-fs,13px)] text-gray-500 dark:text-gray-400 leading-tight">
										<span class="font-bold">{{ item.qty }}×</span> {{ item.item_name }}
									</span>
								</div>
								<div v-if="item.posa_special_instructions"
									class="text-[length:var(--kds-fs-sub,12px)] text-blue-400 mt-0.5 pl-4">
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
				<div v-if="!fullscreen && hiddenCount > 0" aria-hidden="true" data-test="ticket-more-fade"
					class="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-white to-transparent dark:from-gray-800"></div>
				<!-- //// Neoffice — « More → » says that the columns of the panel go on past its right edge (task 38a-3, ruling 107): a 24-dish ticket does not fit one screen even in large text. It is ink on paper like the other hints, 44 px high, and a tap brings the next columns in; it goes when the last column is in view. -->
				<button v-if="fullscreen && moreRight" type="button" data-test="ticket-fs-more"
					class="absolute bottom-4 right-4 inline-flex min-h-[44px] touch-manipulation items-center rounded-full bg-gray-800 px-4 text-sm font-semibold text-white shadow-md dark:bg-white dark:text-gray-800"
					@click="showMoreColumns">
					{{ __("More →") }}
				</button>
			</div>
			<!-- //// Neoffice — the strip is the way into the full-screen ticket (task 38a-3, ruling 107 layer 3): a tap on « +N lines » opens the ticket over the board. It is a button now; a dish keeps its own tap (its status menu). -->
			<!-- //// Neoffice — the strip stands at the FOOT of EVERY ticket, long or short (kitchen test, 01.11): « View all » opens the ticket full screen in larger text, and « +N lines » says how many dishes are out of sight when there are some. The same on the kitchen, the bar and the pass; the TOP of the card keeps its place for the print button. -->
			<button v-if="!fullscreen" type="button" data-test="ticket-more-strip"
				class="flex h-6 w-full flex-shrink-0 touch-manipulation items-center justify-between gap-2 border-t border-gray-100 px-3 active:bg-gray-100 dark:border-gray-700 dark:active:bg-gray-700"
				@click="openFull">
				<!-- //// Neoffice — « View all » is on a card that SCROLLS, whether dishes are still out of sight or the cook has come to the end of them (task 38a-3, ruling 107 layer 3): the full-screen ticket is one tap away from either -->
				<span data-test="ticket-view-all"
					class="pointer-events-none inline-flex items-center gap-1 text-xs font-semibold text-gray-600 dark:[&&]:!text-gray-300">
					<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
					{{ __("View all") }}
				</span>
				<span v-if="hiddenCount > 0" data-test="ticket-more"
					class="pointer-events-none rounded-full bg-gray-800 px-2.5 py-[3px] text-xs font-bold leading-none text-white dark:bg-white dark:text-gray-800">
					{{ hiddenCount === 1 ? __("+{0} line", [1]) : __("+{0} lines", [hiddenCount]) }}
				</span>
			</button>
		</div>

		<!-- //// Neoffice — the ticket opened full screen over the board (task 38a-3, ruling 107 layer 3): THIS card again, in its full-screen form, inside the shell that takes the screen. It is fed the same order object, so the board behind and the panel never differ; when the ticket leaves the board this card goes with it and the panel closes. -->
		<TicketFullScreen v-if="fullOpen && !fullscreen" :label="tableLabel" @close="closeFull">
			<KDSOrderCard v-bind="$props" fullscreen @close="closeFull" @print="emit('print', $event)" @status-updated="emit('status-updated')" />
		</TicketFullScreen>
	</div>
</template>

<script setup>
import { ref, computed, inject, watch, nextTick, onMounted, onUnmounted } from "vue"
import { Button } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import { useRestaurantStore } from "@/stores/restaurant"
import { kitchenStatusOf } from "@/utils/kitchenBands"
import { elapsedLabel } from "@/utils/elapsedLabel"
//// Neoffice — a badge says the state, a button says the action (task 38a-1, ruling 113)
import { kitchenActionLabel, kitchenStatusLabel } from "@/utils/kitchenStatus"
//// Neoffice — the room's short code on the header's line (task 38a-1)
import { roomCode } from "@/utils/kitchenRoomCode"
import { formatTicketNo } from "@/utils/ticketNumber"
//// Neoffice — the three kinds of text of a dish: options, remark, allergy (task 38a-1, ruling 123)
import { allergyWordsOf } from "@/utils/kitchenTextKinds"
import { FULLSCREEN_FRAME, KITCHEN_FRAME, TICKET_FRAME } from "@/utils/ticketLayout"
//// Neoffice — what a ticket says under a dish, written once for the kitchen and the runner (task 38a-2, ruling 130)
import TicketDishNotes from "@/components/invoices/TicketDishNotes.vue"
//// Neoffice — five seconds to take back a « Ready » or a « Deliver » (task 38a-2, ruling 112)
import { offerUndo } from "@/composables/useUndoToast"
import { dishesToPutBack, dishState, putBack, UNDOABLE_STATUSES } from "@/utils/kitchenUndo"
//// Neoffice — a line of several units can be marked ready for some of them: the units still to cook, and what already left (kitchen test of 01.11)
import { isCookedInPart, orderedQty, unitsLeftToCookOfItem, unitsToCook } from "@/utils/kitchenRunner"
//// Neoffice — what to write on a station's colour in dark mode (task 46)
import { inkOn } from "@/utils/stationColors"
//// Neoffice — the long ticket's hint and the status menu's place (task 23)
import { placeMenu } from "@/utils/menuPlacement"
import { dishesOutOfSight } from "@/utils/ticketScrollHints"
//// Neoffice — the dishes of a send in sections by family, and the pale tint of a category (Daniel, 01.11)
import TicketSectionHeader from "@/components/invoices/TicketSectionHeader.vue"
import { TINT_CLASS, inSections, tintStyle } from "@/utils/ticketFamilies"
//// Neoffice — the ticket opened full screen over the board (task 38a-3, ruling 107 layer 3): its shell, the size it is drawn in, and the length it says
import TicketFullScreen from "@/components/invoices/TicketFullScreen.vue"
import { DEFAULT_TEXT_SIZE, fullScreenVariables, TEXT_SIZE_KEY } from "@/utils/kitchenTextSize"
import { kitchenLineCount } from "@/utils/wideTicket"

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
	//// Neoffice — THIS card is the ticket opened full screen over the board, not a card of the board (task 38a-3, ruling 107 layer 3): the board's card renders itself, with this set, inside the
	//// shell that takes the screen. It is bigger, has an × and lays its dishes out in columns; it has no « +N lines » strip, since nothing is cut.
	fullscreen: {
		type: Boolean,
		default: false,
	},
})

const emit = defineEmits(["status-updated", "print", "close"])
const { showError } = useToast()
const restaurantStore = useRestaurantStore()
const loading = ref(false)
const showDeliveredConfirm = ref(false)
const activeItemMenu = ref(null)
//// Neoffice — the ticket opened full screen (task 38a-3, ruling 107 layer 3). It is open for as long as this card is on the board: the card is fed the order the screen refreshes, so the panel
//// follows every change; when the ticket leaves the board (it was made ready, it was delivered) this card goes, and the panel with it. The size of the text is the screen's, handed down
//// (TEXT_SIZE_KEY): the panel is teleported out of the screen's root, where the size's CSS variables do not reach, so it carries its own, one step bigger (utils/kitchenTextSize).
const fullOpen = ref(false)
const openFull = () => {
	fullOpen.value = true
}
const closeFull = () => {
	fullOpen.value = false
}
const textSize = inject(TEXT_SIZE_KEY, ref(DEFAULT_TEXT_SIZE))
const fullVariables = computed(() => fullScreenVariables(textSize.value))
//// Neoffice — a takeaway is handed over, not delivered to a table (task 38a-1)
const isTakeaway = computed(() => !!props.order.is_takeaway)

//// Neoffice — the toast that offers to take a move back for five seconds (task 38a-2, ruling 112). What it says is the table (or the takeaway) and the
//// state the ticket came to; what it does is put each dish back in the state it had, one call per item, and tell the user when the server refuses.
const tableLabel = computed(() =>
	isTakeaway.value
		? __("Takeaway")
		: props.order.table_display_name || props.order.restaurant_table || "",
)
function offerBack(message, entries) {
	offerUndo({
		message,
		undo: async () => {
			try {
				await putBack(call, entries)
				return true
			} catch (error) {
				showError(__("Failed to update item status"))
				return false
			}
		},
	})
}

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
//// Neoffice — the code the server tells (`area_code`: the one typed on the room, else made from its name, task 38b) wins over the one derived here
const roomChip = computed(() =>
	isTakeaway.value ? "" : props.order.area_code || roomCode(props.roomName),
)
//// Neoffice — the server tells the whole number and the digits (`ticket_digits`, task 38b); `formatTicketNo` writes it (0007)
const ticketNumber = computed(() =>
	String(
		formatTicketNo(props.order.ticket_no, props.order.ticket_digits) ||
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
	//// Neoffice — in a send, the dishes still to cook come first and the finished ones (struck through) after them, each group in its own order (kitchen test, 01.11): a ticket whose
	//// starters have left kept them at the top, between the dishes to cook. `_globalIdx` stays the dish's place in `activeItems`, which the menu reads.
	const isDone = (item) => item.kds_status === "Delivered"
	//// Neoffice — and the dishes still to cook of a send are drawn in SECTIONS by family, in the order of the meal (Daniel, 01.11); the finished ones follow under no label. A ticket with no family is one section without a label: drawn as it was.
	return sorted.map(([batch, batchItems]) => ({
		batch,
		items: inSections(
			batchItems.filter((item) => !isDone(item)),
			batchItems.filter(isDone),
		),
	}))
})
const waitingItems = computed(() =>
	(props.order.items || []).filter((i) => i.kds_status === "Waiting"),
)

//// Neoffice — the status the ticket shows, from the DISHES it shows (fix round 1, ruling 78). The order's own status is not
//// it on its own: until task 38b `update_item_kds_status` left it alone until every dish was ready, so an order whose dishes were
//// being cooked said "Pending" (with several stations, every day) and the ticket kept its yellow border, its PENDING badge and its
//// Start button in the "in preparation" band; the server now follows all the dishes by the same rule, but a station's screen sees
//// only its own dishes. The same rule as the band's (utils/kitchenBands): none begun, Pending and Start;
//// one begun, Preparing and Ready; all ready, Ready and Delivered.
const status = computed(() => kitchenStatusOf(props.order))

//// Neoffice — what to do once the server has answered (fix round 1): see the `refresh` prop
function changed() {
	if (props.refresh) props.refresh()
	else emit("status-updated")
}

//// Neoffice — the status menu of a dish opens ON THE SCREEN, not inside the ticket (task 23). Upstream of this file's
//// first version it hung under the dish (`absolute`); the dishes now scroll inside the ticket and the foot of the
//// scrolling body would cut it. It is 192 px wide (w-48); each button is 48 px high with 4 px between, and the menu has a button for every
//// status the dish is not at (a dish being prepared has one, a dish waiting two or three), under a head that names the dish, with its
//// padding and borders besides: the room it needs, and where it hangs from when it opens upward, are those of the menu it really is
//// (fix round 1; bigger and headed by the dish after the kitchen test of 01.11).
const MENU_WIDTH = 192
//// Neoffice — the menu of a dish with a quantity to pick (w-60), for « Mark ready · 4 of 6 » to stay on one line
const MENU_WIDE_WIDTH = 240
const MENU_BUTTON_HEIGHT = 52
const MENU_FRAME_HEIGHT = 42
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

//// Neoffice — a line of several units can be marked ready for SOME of them (kitchen test of 01.11: six of the same dish, four are done). The picker appears on a dish
//// with more than one unit left to cook (all its lines of the order together: the server fills them in the order of the lines), starts on ALL that is left, and a tap on
//// « ready » with that number is what it always was. The units still to cook are what a line shows as its quantity; `shownQty` is that, for a card handed the order itself
//// or a view of it.
const pickedUnits = ref(1)
const unitsLeftOf = (item) => unitsLeftToCookOfItem(props.order.items || [], item.item_code)
const pickerShown = (item) => offers(item, "Ready") && unitsLeftOf(item) > 1
const shownQty = (item) => (isCookedInPart(item) ? unitsToCook(item) : item.qty)
const unitsSentOf = (item) => Math.min(Number(item.kds_ready_qty) || 0, orderedQty(item))
// The number picked, within what is left to cook (a refresh can lower what is left under an open menu)
const pickedOf = (item) => Math.min(Math.max(1, pickedUnits.value), Math.max(1, unitsLeftOf(item)))
function stepUnits(item, delta) {
	pickedUnits.value = Math.min(Math.max(1, pickedOf(item) + delta), unitsLeftOf(item))
}
function readyLabel(item) {
	const base = kitchenActionLabel("ready", { takeaway: isTakeaway.value })
	if (!pickerShown(item)) return base
	const left = unitsLeftOf(item)
	const picked = pickedOf(item)
	return picked >= left ? base : `${base} · ${__("{0} of {1}", [picked, left])}`
}
function pressReady(item) {
	const left = unitsLeftOf(item)
	const picked = pickerShown(item) ? pickedOf(item) : left
	// All that is left, or no picker: the whole line, as it always was
	return updateItemStatus(item, "Ready", picked < left ? picked : undefined)
}

//// Neoffice — a delivered dish is done (task 42): its tap does nothing, no menu, no call, and nothing to put it back
//// (coming back is a separate, deliberate act, not a tap on a struck-through line)
function isDelivered(item) {
	return item.kds_status === "Delivered"
}

//// Neoffice — the dish whose status menu is open (kitchen test, 01.11): its line is highlighted, so that the menu cannot be read as the one of the dish under it
function isMenuOf(item) {
	return activeItemMenu.value === item._globalIdx && !isDelivered(item)
}

//// Neoffice — the pale tint of a dish's category (Daniel, 01.11): the inline style that carries it, `undefined` for a dish whose category has no colour (or one that is no strict #RRGGBB: it comes from user data) and for the dish whose status menu is open, whose highlight the tint must never hide
const lineTint = (item) => (isMenuOf(item) ? undefined : tintStyle(item.service_color))

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
		//// Neoffice — the picker is a row of its own, and the menu is wider with it (kitchen test of 01.11)
		const picker = pickerShown(item)
		menuPosition.value = placeMenu(
			anchor,
			{
				width: picker ? MENU_WIDE_WIDTH : MENU_WIDTH,
				height: buttons * MENU_BUTTON_HEIGHT + MENU_FRAME_HEIGHT + (picker ? MENU_BUTTON_HEIGHT : 0),
			},
			{ width: window.innerWidth, height: window.innerHeight },
		)
	}
	activeItemMenu.value = idx
	//// Neoffice — the picker starts on ALL that is left to cook
	pickedUnits.value = Math.max(1, unitsLeftOf(item))
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
//// Neoffice — how many dishes the cook has scrolled by: the card still SCROLLS at the end of its dishes, where nothing is left to count (task 38a-3, ruling 107 layer 3)
const scrolledCount = ref(0)
const scrolls = computed(() => hiddenCount.value > 0 || scrolledCount.value > 0)
//// Neoffice — in the panel nothing is cut at the foot, the columns go on past the right edge: `moreRight` says whether some are out of sight there, and a tap on « More → » brings them in
const moreRight = ref(false)
function measureRight() {
	const body = bodyEl.value
	moreRight.value = !!body && body.scrollWidth - body.clientWidth - body.scrollLeft > 2
}
function showMoreColumns() {
	bodyEl.value?.scrollBy?.({ left: bodyEl.value.clientWidth * 0.8, behavior: "smooth" })
}
function measureHidden() {
	if (props.fullscreen) return measureRight()
	const { ahead, behind } = dishesOutOfSight(bodyEl.value)
	hiddenCount.value = ahead
	scrolledCount.value = behind
}
function onBodyScroll() {
	activeItemMenu.value = null
	measureHidden()
}
//// Neoffice — the second timer gives way before the number drops to a second line (task 38a-1, ruling 125 and the mockup): on a narrow card, or in a big
//// size, the header's one line is the room's code, the table, the number, then the two timers; when they do not all fit, the table's total time (the one that
//// is not needed to cook) is the first to go, so that the number stays beside the table. It is measured on the screen whenever the header's size changes.
const headerEl = ref(null)
const refEl = ref(null)
const titleEl = ref(null)
const totalGivesWay = ref(false)
// Each run shows the second timer, measures with a forced layout, and hides it if the line wrapped: the DOM is patched in microtasks, so the browser
// only ever paints the final state, and the observer sees the same size as before and does not call again
async function fitHeader() {
	if (!headerEl.value || !refEl.value || !titleEl.value) return
	totalGivesWay.value = false
	await nextTick()
	const line = titleEl.value?.offsetHeight || 0
	if (line > 0 && refEl.value && refEl.value.offsetHeight > line * 1.5)
		totalGivesWay.value = true
}

let sizeObserver = null
watch(() => props.order, measureHidden, { deep: true, flush: "post" })

// Update individual item KDS status (optimistic UI)
//// Neoffice — `units`: mark that many units ready, not the whole line (kitchen test of 01.11). The move is then not shown before the server answers (the units a line
//// shows are worked out from its counters, which only the server knows), and the screen reads the orders again at once.
async function updateItemStatus(item, newStatus, units) {
	activeItemMenu.value = null
	const partial = units !== undefined
	// Optimistic: update all items with same item_code instantly
	const rows = props.order.items.filter((i) => i.item_code === item.item_code)
	const oldStatuses = rows.map((i) => i.kds_status)
	//// Neoffice — the state the dish had, counters included: what an undo puts back
	const before = dishState(rows[0] || item)
	if (!partial)
		rows.forEach((i) => {
			i.kds_status = newStatus
		})
	try {
		await call("pos_next.api.restaurant.update_item_kds_status", {
			invoice_name: props.order.name,
			item_code: item.item_code,
			status: newStatus,
			...(partial ? { qty: units } : {}),
		})
		//// Neoffice — a dish made ready or delivered by a tap can be taken back for five seconds (task 38a-2, ruling 112); a line made ready in part goes back to the counters it had
		const after = partial
			? {
					item_code: item.item_code,
					kds_status: "Preparing",
					kds_ready_qty: (Number(before.kds_ready_qty) || 0) + units,
				}
			: { item_code: item.item_code, kds_status: newStatus }
		const entries = dishesToPutBack([
			{ invoice: props.order.name, dishes: [after], before: [before] },
		])
		if (UNDOABLE_STATUSES.includes(newStatus) && entries.length)
			offerBack(
				`${tableLabel.value} · ${item.item_name} · ${kitchenStatusLabel(newStatus, { takeaway: isTakeaway.value })}${partial ? ` · ${__("{0} of {1}", [units, unitsLeftOf(item)])}` : ""}`,
				entries,
			)
		changed()
	} catch (error) {
		// Rollback on error
		rows.forEach((i, index) => {
			i.kds_status = oldStatuses[index]
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
		//// Neoffice — the header is fitted again whenever its width or the text size changes (task 38a-1): the same observer, one for the card
		sizeObserver = new ResizeObserver(() => {
			measureHidden()
			fitHeader()
		})
		if (bodyEl.value) sizeObserver.observe(bodyEl.value)
		if (linesEl.value) sizeObserver.observe(linesEl.value)
		if (headerEl.value) sizeObserver.observe(headerEl.value)
	}
	fitHeader()
	//// Neoffice — the fonts arrive after the first layout: the widths change with them (task 38a-1)
	document.fonts?.ready?.then(() => {
		fitHeader()
		//// Neoffice — the panel's columns break where the font's widths say (task 38a-3)
		if (props.fullscreen) measureRight()
	})
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
//// Neoffice — hours and minutes from the hour on (utils/elapsedLabel): a ticket left open since the day before read « 1107:52 »
const elapsedTime = computed(() => elapsedLabel(now.value - lastActionTime.value))

// Total time since table was opened (creation)
const totalTime = computed(() => elapsedLabel(now.value - new Date(props.order.creation)))
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

//// Neoffice — what the panel's header says of the ticket: how long it is, and its state in the colour of the state (dark mode: the dark ramp's tokens, as the menu's)
const lineCount = computed(() => kitchenLineCount(props.order))
const lineCountLabel = computed(() =>
	lineCount.value === 1 ? __("{0} line", [1]) : __("{0} lines", [lineCount.value]),
)
const stateTextClass = computed(() => {
	switch (status.value) {
		case "Pending":
			return "text-yellow-700 dark:text-ds-warning"
		case "Preparing":
			return "text-blue-800"
		case "Ready":
			return "text-green-700 dark:text-ds-success"
		default:
			return "text-gray-600 dark:text-gray-300"
	}
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

//// Neoffice — the station tag is the first three letters of the station's name in capitals (« Cuisine » CUI, « Bar » BAR): the colour tells the stations apart,
//// and a tag is zero extra height only if it is short (task 38a-1, ruling 110). The whole name is the tag's title.
const stationCode = (item) => roomCode(item.station_name || item.preparation_station)

//// Neoffice — a dish's own state is written on its line only when it is NOT the ticket's: a dish being prepared on a ticket in preparation says
//// nothing, one still to start, or already at the pass, says so. A delivered dish says it with a check mark and its strike-through instead.
function stateWord(item) {
	if (!item.kds_status || isDelivered(item) || item.kds_status === status.value)
		return ""
	return kitchenStatusLabel(item.kds_status, { takeaway: isTakeaway.value })
}

//// Neoffice — the restaurant's own list of allergy words when its settings carry one (`allergy_words`), else the default (task 38a-1, ruling 123);
//// the dish's options, remark and allergy are drawn by TicketDishNotes (task 38a-2)
const allergyWords = computed(() =>
	allergyWordsOf(restaurantStore.restaurantSettings),
)

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
		//// Neoffice — a main action pressed in the panel is the cook's last word on the ticket: the panel closes (task 38a-3)
		if (props.fullscreen) emit("close")
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
		//// Neoffice — the whole state of each dish, counters included: what an undo puts back (kitchen test of 01.11)
		states: (props.order.items || []).map((dish) => dishState(dish)),
	}
	advanceDishes(newStatus)
	//// Neoffice — what to put back if the cook takes the move back (task 38a-2, ruling 112): each dish that moved, in the state it had
	const toPutBack = dishesToPutBack([
		{ invoice: props.order.name, dishes: props.order.items || [], before: before.states },
	])
	// With every station the server gives the order the status asked. With a station it makes the order follow its dishes,
	// those of every station, which this screen does not see: the order is left to the server, the look follows the dishes
	if (!props.station) props.order.kds_status = newStatus
	try {
		await call("pos_next.api.restaurant.update_kds_status", {
			invoice_name: props.order.name,
			status: newStatus,
			...(props.station ? { station: props.station } : {}),
		})
		if (UNDOABLE_STATUSES.includes(newStatus) && toPutBack.length)
			offerBack(
				`${tableLabel.value} · ${kitchenStatusLabel(newStatus, { takeaway: isTakeaway.value })}`,
				toPutBack,
			)
		changed()
		//// Neoffice — a main action pressed in the panel is the cook's last word on the ticket: the panel closes (task 38a-3)
		if (props.fullscreen) emit("close")
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

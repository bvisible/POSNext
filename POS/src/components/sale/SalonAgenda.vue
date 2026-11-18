<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The agenda of a salon, in the till's middle column where the items are (NeoSalon, step 2, lot G4, plan « Le mode salon de la caisse », boards 2 and 7): -->
	<!-- //// one column per person with how she stands, the appointments as blocks, the free hours as buttons that book; on a phone, one person's day as a list. The site decides what a cashier sees: a colleague's -->
	<!-- //// appointment comes busy, without a name, and nothing here is a permission (the sheet only offers what `can` says). -->
	<section class="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-900" data-test="salon-agenda" :aria-label="__('Agenda')">
		<header class="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
			<div class="flex items-center gap-1.5">
				<button type="button" data-test="agenda-previous" class="h-11 w-11 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800" :aria-label="__('Previous day')" @click="store.moveDay(-1)">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m15 18-6-6 6-6" /></svg>
				</button>
				<button type="button" data-test="agenda-today" class="h-11 px-3 rounded-lg border text-sm font-semibold" :class="store.isToday ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-400/20 dark:text-blue-100' : 'border-gray-200 text-gray-700 dark:border-gray-600 dark:text-gray-200'" @click="store.goToday()">
					{{ __("Today") }}
				</button>
				<button type="button" data-test="agenda-next" class="h-11 w-11 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800" :aria-label="__('Next day')" @click="store.moveDay(1)">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" /></svg>
				</button>
			</div>
			<!-- //// Neoffice — any date, beyond the band of the week (NeoSalon B', 16.11.2026) -->
			<input type="date" data-test="agenda-date" class="h-11 rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200" :value="store.date" :aria-label="__('Choose a date')" @change="chooseDate" />
			<h2 class="flex-1 min-w-0 truncate text-2xl leading-tight text-gray-900 dark:text-gray-100" style="font-family: Forum, Georgia, serif" data-test="agenda-title">{{ dayTitle }}</h2>
			<div v-if="store.mine.length" class="inline-flex rounded-lg bg-gray-100 p-0.5 text-sm dark:bg-gray-800" role="group" :aria-label="__('Columns')">
				<button type="button" data-test="agenda-all" class="min-h-[40px] rounded-md px-3" :class="!store.onlyMine ? 'bg-white font-semibold shadow-sm dark:bg-gray-700' : 'text-gray-600 dark:text-gray-300'" @click="store.onlyMine = false">{{ __("All") }}</button>
				<button type="button" data-test="agenda-mine" class="min-h-[40px] rounded-md px-3" :class="store.onlyMine ? 'bg-white font-semibold shadow-sm dark:bg-gray-700' : 'text-gray-600 dark:text-gray-300'" @click="store.onlyMine = true">{{ __("Me only") }}</button>
			</div>
			<button type="button" data-test="agenda-refresh" class="h-11 w-11 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800" :aria-label="__('Refresh')" :disabled="store.loading" @click="store.refresh()">
				<svg class="h-5 w-5" :class="store.loading ? 'animate-spin' : ''" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 0 0-15-6.7L3 8M3 3v5h5M3 12a9 9 0 0 0 15 6.7L21 16M21 21v-5h-5" /></svg>
			</button>
			<button v-if="store.capabilities.book" type="button" data-test="agenda-new" class="min-h-[44px] inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900" @click="emit('new-appointment', { person: defaultPerson, from: null })">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5v14" /></svg>
				{{ __("New appointment") }}
			</button>
		</header>

		<!-- //// Neoffice — the band of the week (NeoSalon B', 16.11.2026, Jérémy: « vous avez de la place jeudi ? »): each day's free time, a touch goes there -->
		<nav v-if="weekDays.length" class="grid grid-cols-7 gap-1.5 px-4 pb-2" data-test="agenda-week" :aria-label="__('The week')">
			<button v-for="d in weekDays" :key="d.date" type="button" class="min-h-[52px] rounded-lg border px-2 py-1 text-left leading-tight" :class="d.selected ? 'border-blue-500 bg-blue-50 dark:bg-blue-400/20' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800'" :aria-pressed="d.selected ? 'true' : 'false'" @click="store.setDay(d.date)">
				<span class="block truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{{ d.label }}</span>
				<span class="block truncate text-xs" :class="d.tone">{{ d.free }}</span>
			</button>
		</nav>

		<!-- The salon is closed that day, or has other hours: said once, above the columns. What was booked before the closing is never cancelled by itself. -->
		<div v-if="salonNotice" class="mx-4 mb-2 rounded-lg px-4 py-2 text-sm" :class="salonNotice.closed ? 'bg-yellow-50 text-yellow-900 dark:bg-yellow-400/15 dark:text-yellow-100' : 'bg-blue-50 text-blue-900 dark:bg-blue-400/15 dark:text-blue-100'" data-test="agenda-salon">
			<b class="font-semibold" data-test="agenda-salon-title">{{ salonNotice.title }}</b>
			<template v-if="salonNotice.detail"> · {{ salonNotice.detail }}</template>
			<div v-if="store.toHandleCount" class="mt-0.5" data-test="agenda-to-handle">{{ __("{0} booked before the closing, to move or cancel with the customers. None is cancelled by itself.", [store.toHandleCount]) }}</div>
		</div>
		<!-- A person who is away that day (leave, holiday) with appointments booked before: said once; none is cancelled by itself -->
		<p v-else-if="store.awayCount" class="mx-4 mb-2 rounded-lg bg-yellow-50 px-4 py-2 text-sm text-yellow-900 dark:bg-yellow-400/15 dark:text-yellow-100" data-test="agenda-away">
			{{ __("{0} appointments of a person who is away that day, to move or cancel with the customers. None is cancelled by itself.", [store.awayCount]) }}
		</p>

		<p v-if="store.fromCache" data-test="agenda-offline" class="mx-4 mb-2 rounded-lg bg-yellow-50 px-4 py-2 text-sm text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-100">
			<b class="font-semibold">{{ __("No network.") }}</b> {{ __("The agenda is the one kept at {0}. Collecting an appointment works as usual.", [keptAt]) }}
		</p>
		<p v-else-if="offline" data-test="agenda-no-network" class="mx-4 mb-2 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
			{{ __("No network and no agenda kept: the till sells as usual, without appointments.") }}
		</p>
		<p v-else-if="store.failed && !store.loaded" data-test="agenda-failed" class="mx-4 mb-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
			{{ __("The agenda could not be read.") }}
		</p>
		<p v-else-if="store.loading && !store.loaded" class="px-4 py-6 text-sm text-gray-500">{{ __("Loading...") }}</p>

		<!-- Tablet and desktop: the columns -->
		<div v-if="uiStore.isDesktop && store.loaded && store.columns.length" class="flex-1 min-h-0 overflow-auto border-t border-gray-100 dark:border-gray-800" data-test="agenda-grid">
			<div class="grid min-w-full" :style="{ gridTemplateColumns: gridTemplate }">
				<div class="sticky top-0 left-0 z-30 bg-white dark:bg-gray-900" />
				<div
					v-for="column in store.columns"
					:key="`head-${column.key}`"
					class="sticky top-0 z-20 flex flex-col gap-1 border-b border-s border-gray-100 bg-white px-2 pb-2 pt-1.5 dark:border-gray-800 dark:bg-gray-900"
					:data-test="`column-head-${column.key}`"
				>
					<div class="flex items-center gap-2">
						<span v-if="column.person" class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[10px] font-bold text-white" :style="{ background: colorOf(column.person) }" aria-hidden="true">{{ initialsOf(column.person.sales_person_name) }}</span>
						<!-- the name before the pill (17.11): at a counter's width « From 08:30 » took the whole line and the name was cut to nothing; the pill now goes under the name when both do not fit -->
						<div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1" :data-test="`column-who-${column.key}`">
							<b class="max-w-full truncate text-sm text-gray-900 dark:text-gray-100" :data-test="`column-name-${column.key}`">{{ column.person ? column.person.sales_person_name : __("To assign") }}</b>
							<span v-if="standing(column.person)" class="flex-none rounded-full px-2 py-0.5 text-[11px] font-medium" :class="TONES[standing(column.person).tone]" :data-test="`column-standing-${column.key}`">{{ standing(column.person).label }}</span>
						</div>
					</div>
					<div class="truncate text-xs text-gray-500 dark:text-gray-400">{{ hoursText(column.person) }}</div>
				</div>

				<div class="sticky left-0 z-10 bg-white text-[11px] text-gray-500 dark:bg-gray-900 dark:text-gray-400" :style="{ height: `${gridHeight}px` }">
					<div v-for="hour in hours" :key="hour" class="absolute end-1.5 -translate-y-1/2" :style="{ top: `${(hour - store.range.start) * PX_PER_HOUR}px` }">{{ clockOf(hour * 60) }}</div>
				</div>

				<div v-for="column in store.columns" :key="`col-${column.key}`" class="relative border-s border-gray-100 dark:border-gray-800" :style="{ height: `${gridHeight}px`, backgroundImage: lines, backgroundSize: `100% ${PX_PER_HOUR}px` }" :data-test="`column-${column.key}`">
					<!-- //// Neoffice — where a dragged appointment would go: the person and the quarter under the pointer (NeoSalon B', 16.11.2026) -->
					<!-- //// and, a moment after the pointer stops, whether the hour holds there (the window's own check), before the drop -->
					<!-- //// Opaque in both themes (what lies under it no longer shows through the words), the words in a label just below it, read whatever the length of the appointment -->
					<div v-if="drag && drag.mark && drag.mark.key === String(column.key)" class="pointer-events-none absolute inset-x-1.5 z-20 rounded-lg border-2 border-dashed bg-pos-surface p-1" :class="markClass(drag.mark.fit)" :style="{ top: `${drag.mark.top}px`, height: `${drag.mark.height}px` }" data-test="agenda-drop">
						<span class="inline-block rounded px-1.5 text-[11px] font-semibold text-white" :class="drag.mark.fit && !drag.mark.fit.ok ? 'bg-yellow-700' : 'bg-blue-600'">{{ drag.mark.time }}</span>
						<span v-if="drag.mark.fit" class="absolute inset-x-0 top-full mt-1 rounded-md border border-s-4 bg-pos-surface px-2 py-1 text-[11px] font-semibold leading-snug text-pos-ink shadow-sm" :class="markClass(drag.mark.fit)" data-test="agenda-drop-fit">{{ fitText(drag.mark.fit) }}</span>
					</div>
					<!-- Not working that day: hatched, and said. Her appointments stay drawn: they were booked before, and are « to handle » (never cancelled by themselves). -->
					<div v-if="column.person && isOff(column.person)" class="absolute inset-0" :style="{ backgroundImage: HATCH }">
						<div class="absolute inset-x-3 top-2 rounded-lg border border-gray-200 bg-white px-3 py-3 text-center text-xs leading-snug text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300" :data-test="`column-off-${column.key}`">
							<b class="text-sm text-gray-800 dark:text-gray-100">{{ standing(column.person).label }}</b>
							<div v-if="column.person.reason" class="mt-0.5">{{ column.person.reason }}</div>
						</div>
					</div>
					<template v-if="column">
						<div v-for="(gap, at) in shaded(column.person)" :key="`off-${at}`" class="absolute inset-x-0 bg-gray-100/80 dark:bg-gray-800/70" :style="{ top: `${gap.top}px`, height: `${gap.height}px` }" aria-hidden="true" />
						<button
							v-for="free in freeOf(column)"
							:key="`free-${free.from}`"
							type="button"
							class="absolute inset-x-1.5 flex items-center justify-center rounded-lg border-[1.5px] border-dashed border-gray-300 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-700 dark:border-gray-600 dark:text-gray-400"
							:style="{ top: `${offsetOf(free.from, store.range, PX_PER_HOUR) + 1}px`, height: `${Math.max(((free.to - free.from) / 60) * PX_PER_HOUR - 3, 30)}px` }"
							:disabled="!store.capabilities.book"
							:data-test="`free-${column.key}-${free.from}`"
							@click="emit('new-appointment', { person: column.person, from: free.from })"
						>
							<template v-if="store.capabilities.book">+ {{ __("{0} free · {1}", [clockOf(free.from), lengthOf(free.to - free.from)]) }}</template>
						</button>
						<button
							v-for="row in column.appointments"
							:key="row.key"
							type="button"
							class="absolute inset-x-1.5 flex flex-col gap-px overflow-hidden rounded-lg border px-2 py-1 text-start text-xs leading-tight transition"
							:class="blockClass(row)"
							:style="blockStyle(row, column.person)"
							:disabled="row.busy"
							:aria-label="row.busy ? __('Busy') : `${row.customer_name || ''} ${hourOf(row.starts_at)}`"
							:data-test="`block-${row.key}`"
							@pointerdown="startDrag($event, row)"
							@touchmove="holdStill"
							@contextmenu="drag && drag.touch && $event.preventDefault()"
							@click="!row.busy && !justDragged() && select(row)"
						>
							<span class="flex items-center justify-between gap-1">
								<b class="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-gray-900 dark:text-gray-100">
									<span v-if="!row.busy" class="h-2 w-2 flex-none rounded-full" :class="DOTS[standsAs(row)]" aria-hidden="true" />
									<span class="truncate">{{ row.busy ? __("Busy") : row.customer_name || __("Walk-in") }}</span>
								</b>
								<span class="flex-none tabular-nums text-gray-600 dark:text-gray-300">{{ hourOf(row.starts_at) }}</span>
							</span>
							<!-- //// Neoffice — a block too short for its pill row says its cabin after the service (NeoSalon, cabins level 2, 17.11.2026): an hour is 56 px, the pill row needs 64 -->
							<span v-if="!row.busy" class="truncate text-gray-700 dark:text-gray-200">{{ titleOf(row) }}<template v-if="cabinChip(row) && blockHeight(row) < 64"> · {{ cabinChip(row).label }}</template></span>
							<span v-else class="truncate text-gray-500 dark:text-gray-400">{{ __("A colleague's appointment") }}</span>
							<span v-if="!row.busy && blockHeight(row) >= 64" class="mt-auto flex items-center gap-1.5">
								<span class="flex-none rounded-full px-2 py-px text-[11px] font-medium" :class="PILLS[standsAs(row)]">{{ pillText(row) }}</span>
								<!-- //// Neoffice — the cabin of the appointment, or « To place » for a care taken before the cabins (NeoSalon, cabins level 2, 16.11.2026) -->
								<span v-if="cabinChip(row)" class="inline-flex min-w-0 items-center gap-1 text-[11px]" :class="cabinChip(row).needs ? 'rounded-full border border-dashed border-gray-400 px-2 py-px text-gray-600 dark:text-gray-300' : 'text-gray-600 dark:text-gray-300'" :data-test="`block-cabin-${row.key}`">
									<span v-if="cabinChip(row).color" class="h-2 w-2 flex-none rounded-full" :style="{ background: cabinChip(row).color }" aria-hidden="true" />
									<span dir="auto" class="truncate">{{ cabinChip(row).label }}</span>
								</span>
							</span>
						</button>
					</template>
					<div v-if="store.isToday && nowOffset !== null" class="pointer-events-none absolute inset-x-0 z-[5] border-t-2 border-blue-500" :style="{ top: `${nowOffset}px` }" />
				</div>
			</div>
		</div>

		<!-- Phone: one person's day, as a list -->
		<div v-else-if="store.loaded && store.columns.length" class="flex flex-1 min-h-0 flex-col" data-test="agenda-list">
			<div class="flex gap-2 overflow-x-auto px-4 pb-2" role="group" :aria-label="__('Who')">
				<button v-for="chip in chips" :key="chip.key" type="button" :data-test="`agenda-chip-${chip.key}`" class="inline-flex min-h-[44px] flex-none items-center gap-2 rounded-[10px] border px-4 text-sm" :class="chip.key === selectedChip ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-400/20 dark:text-blue-100' : 'border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'" @click="phoneKey = chip.key">
					{{ chip.label }} <b class="font-semibold">{{ chip.count }}</b>
				</button>
			</div>
			<div class="flex-1 min-h-0 overflow-y-auto">
				<ul class="flex flex-col">
					<li v-for="item in phoneRows" :key="item.key" class="flex gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
						<div class="w-12 flex-none text-[15px] font-bold tabular-nums text-gray-900 dark:text-gray-100">{{ item.free ? clockOf(item.free.from) : hourOf(item.row.starts_at) }}<span class="block text-xs font-normal text-gray-500">{{ item.free ? lengthOf(item.free.to - item.free.from) : lengthOf(minutesLongOf(item.row)) }}</span></div>
						<button v-if="item.free" type="button" class="flex-1 rounded-lg border-[1.5px] border-dashed border-gray-300 px-3 py-2.5 text-start text-sm text-gray-500 dark:border-gray-600" :disabled="!store.capabilities.book" :data-test="`free-${item.free.from}`" @click="emit('new-appointment', { person: phonePerson, from: item.free.from })"><!-- //// Neoffice — a site that cannot book shows the hour as free, not as a button that does nothing -->{{ store.capabilities.book ? `+ ${__("Book an appointment")}` : __("Free hour") }}</button>
						<button v-else type="button" class="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border px-3 py-2 text-start" :class="blockClass(item.row)" :disabled="item.row.busy" :data-test="`row-${item.row.key}`" @click="!item.row.busy && select(item.row)">
							<b class="truncate text-[15px] text-gray-900 dark:text-gray-100">{{ item.row.busy ? __("Busy") : item.row.customer_name || __("Walk-in") }}</b>
							<span class="truncate text-sm text-gray-700 dark:text-gray-200">{{ item.row.busy ? __("A colleague's appointment") : titleOf(item.row) }}</span>
							<span v-if="!item.row.busy" class="mt-1 flex items-center gap-2"><span class="flex-none rounded-full px-2 py-px text-xs font-medium" :class="PILLS[standsAs(item.row)]">{{ pillText(item.row) }}</span><span v-if="cabinChip(item.row)" class="inline-flex min-w-0 items-center gap-1 text-xs text-gray-600 dark:text-gray-300" :data-test="`row-cabin-${item.row.key}`"><span v-if="cabinChip(item.row).color" class="h-2 w-2 flex-none rounded-full" :style="{ background: cabinChip(item.row).color }" aria-hidden="true" /><span dir="auto" class="truncate">{{ cabinChip(item.row).label }}</span></span></span>
						</button>
					</li>
					<li v-if="!phoneRows.length" class="px-4 py-6 text-sm text-gray-500">{{ __("Nothing booked.") }}</li>
				</ul>
			</div>
		</div>

		<p v-else-if="store.loaded && !store.available" data-test="agenda-unavailable" class="px-4 py-6 text-sm text-gray-500">{{ __("The agenda is not available at this till.") }}</p>
		<!-- //// Neoffice — never « nobody is booked » for a day the till could not read: offline with no agenda kept, the notice above says so (the audit of 18.11) -->
		<p v-else-if="store.loaded && (!offline || store.fromCache)" data-test="agenda-empty" class="px-4 py-6 text-sm text-gray-500">{{ __("Nobody is booked and the team is not set up for this day.") }}</p>
	</section>
</template>

<script setup>
/**
 * The agenda of the salon day (the store reads it from the site, composed from the planning, the money and the time lanes).
 *
 * emits `new-appointment` `{ person, from }` (a free hour, or the « New » button) and `selected` (an appointment's sheet should open).
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useAppointment } from "@/composables/useAppointment"
import { useAppointmentsStore } from "@/stores/appointments"
import { usePOSUIStore } from "@/stores/posUI"
import {
	cabinOf,
	colorOfPerson,
	blockGeometry,
	clockOf,
	freeHoursOf,
	gridTemplateOf,
	hourOf,
	initialsOf,
	isOff,
	lanesOf,
	lengthOf,
	minutesLongOf,
	minutesOf,
	dropTime,
	offsetOf,
	standingOf,
	standsAs,
	titleOf,
} from "@/utils/appointments"
import { offlineState } from "@/utils/offline/offlineState"

const emit = defineEmits(["new-appointment", "selected", "move-to"])

const store = useAppointmentsStore()
const uiStore = usePOSUIStore()
const { checkMove } = useAppointment()

const PX_PER_HOUR = 56
const HATCH = "repeating-linear-gradient(135deg, #F6F3ED 0, #F6F3ED 8px, #ECE7DE 8px, #ECE7DE 9px)"
const TONES = {
	ok: "bg-green-100 text-green-800 dark:bg-green-400/20 dark:text-green-100",
	warn: "bg-yellow-100 text-yellow-800 dark:bg-yellow-400/20 dark:text-yellow-100",
	mute: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
}
const DOTS = {
	booked: "bg-gray-400",
	started: "bg-blue-600",
	finished: "bg-orange-500",
	in_the_till: "bg-blue-600",
	to_handle: "bg-yellow-500",
	paid: "bg-green-600",
	absent: "bg-red-500",
}
const PILLS = {
	booked: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
	started: "bg-blue-50 text-blue-700 dark:bg-blue-400/20 dark:text-blue-100",
	finished: "bg-orange-50 text-orange-700 dark:bg-orange-400/20 dark:text-orange-100",
	in_the_till: "bg-blue-50 text-blue-700 dark:bg-blue-400/20 dark:text-blue-100",
	to_handle: "bg-yellow-100 text-yellow-800 dark:bg-yellow-400/20 dark:text-yellow-100",
	paid: "bg-green-50 text-green-700 dark:bg-green-400/20 dark:text-green-100",
	absent: "bg-red-50 text-red-700 dark:bg-red-400/20 dark:text-red-100",
}
//// Neoffice — the hour lines in the till's own line colour, which follows its dark theme (a fixed #EFEAE1 drew bright white lines across the dark agenda, 16.11)
const lines = "linear-gradient(to bottom, var(--pos-line) 0, var(--pos-line) 1px, transparent 1px)"

//// Neoffice — the till's network state, followed: it was read once, so an agenda opened online that lost its network kept saying nothing about it, and drew « nobody is booked » for a day
//// it could not read (the audit of 18.11).
const offline = ref(Boolean(offlineState.isOffline))
let stopFollowingTheNetwork = null
onMounted(() => {
	offline.value = Boolean(offlineState.isOffline)
	if (typeof offlineState.subscribe === "function") stopFollowingTheNetwork = offlineState.subscribe((state) => (offline.value = Boolean(state?.isOffline)))
})
const gridHeight = computed(() => (store.range.end - store.range.start) * PX_PER_HOUR)
const hours = computed(() => Array.from({ length: store.range.end - store.range.start + 1 }, (_, at) => store.range.start + at))
const nowOffset = computed(() => {
	const top = offsetOf(store.now, store.range, PX_PER_HOUR)
	return top >= 0 && top <= gridHeight.value ? top : null
})
// The band of the week: each day's free time in the words of the till (NeoSalon B', 16.11.2026)
const weekDays = computed(() =>
	(store.week || []).map((d) => {
		const when = new Date(`${d.date}T12:00:00`)
		const label = Number.isNaN(when.getTime()) ? d.date : when.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })
		const free = !d.working ? __("Nobody works") : d.free_minutes > 0 ? __("{0} free", [lengthOf(d.free_minutes)], "free time") : __("Full")
		const tone = !d.working ? "text-gray-400" : d.free_minutes > 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"
		return { date: d.date, label, free, tone, selected: d.date === store.date }
	}),
)
// a date chosen beyond the week; a date half typed is nothing yet
const chooseDate = (event) => {
	const value = event?.target?.value
	if (/^\d{4}-\d{2}-\d{2}$/.test(value || "")) store.setDay(value)
}
const dayTitle = computed(() => {
	const when = new Date(`${store.date}T12:00:00`)
	if (Number.isNaN(when.getTime())) return store.date
	// A phone has no room for « mardi 10 novembre » beside the day arrows: the short form there
	return when.toLocaleDateString(undefined, uiStore.isDesktop ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" })
})
const SALON_REASONS = {
	holiday: () => __("Public holiday"),
	closure: () => __("Closure"),
	weekly_off: () => __("Weekly day off"),
	special_hours: () => __("Special hours"),
	no_hours: () => __("No opening hours"),
}
/** What the agenda says about the day when the salon is closed or has other hours: `{ closed, title, detail }`, or null on a normal day. */
const salonNotice = computed(() => {
	const salon = store.salon
	if (!salon || salon.state === "open") return null
	const why = salon.label || (SALON_REASONS[salon.reason] ? SALON_REASONS[salon.reason]() : "")
	if (salon.state === "closed") return { closed: true, title: __("Closed that day"), detail: why }
	const hours = (salon.periods || []).map(([from, to]) => `${from}–${to}`).join(" · ")
	return { closed: false, title: __("Special hours"), detail: [hours, salon.label].filter(Boolean).join(" · ") }
})
const keptAt = computed(() => (store.cachedAt ? new Date(store.cachedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""))
// The cashier's own column is where « New » starts; the first column otherwise
const defaultPerson = computed(() => {
	const own = store.columns.find((column) => column.person && store.mine.includes(column.person.sales_person))
	return (own || store.columns.find((column) => column.person))?.person || null
})

// the colour the reservation gives her, the same as on the planning of the desk (NeoSalon B', 16.11.2026)
const colorOf = (person) => colorOfPerson(person)
const standing = (person) => (person ? standingOf(person) : null)

function hoursText(person) {
	if (!person) return __("Nobody yet")
	if (person.status === "unknown" || !person.periods?.length) return person.reason || ""
	return person.periods.map(([from, to]) => `${from}–${to}`).join(" · ")
}

/** The hours of a column outside what the person works: shaded, like the pause between two periods. */
function shaded(person) {
	if (!person?.periods?.length) return []
	const first = store.range.start * 60
	const last = store.range.end * 60
	const gaps = []
	let cursor = first
	for (const [from, to] of person.periods) {
		const start = minutesOf(from)
		const end = minutesOf(to)
		if (start === null || end === null) continue
		if (start > cursor) gaps.push([cursor, start])
		cursor = Math.max(cursor, end)
	}
	if (cursor < last) gaps.push([cursor, last])
	return gaps.map(([from, to]) => ({ top: offsetOf(from, store.range, PX_PER_HOUR), height: ((to - from) / 60) * PX_PER_HOUR }))
}

function freeOf(column) {
	return column.person && !store.closed && !isOff(column.person) ? freeHoursOf(column.person, column.appointments) : []
}

function blockHeight(row) {
	return blockGeometry(row, store.range, PX_PER_HOUR).height
}

// the lanes of every column: two appointments that overlap stand side by side, in a person's column as in the one « to assign »
const lanes = computed(() => {
	const all = new Map()
	for (const column of store.columns) for (const [key, lane] of lanesOf(column.appointments)) all.set(key, lane)
	return all
})

// a column cut into lanes is as wide as that many columns
const gridTemplate = computed(() => gridTemplateOf(store.columns))

function blockStyle(row, person) {
	const { top, height } = blockGeometry(row, store.range, PX_PER_HOUR)
	const style = { top: `${top + 1}px`, height: `${height}px` }
	const lane = lanes.value.get(row.key)
	if (lane && lane.of > 1) {
		// as inset-x-1.5, 6px from each side of the column, and 4px between two lanes
		style.left = `calc((100% - 8px) * ${lane.lane / lane.of} + 6px)`
		style.width = `calc((100% - 8px) / ${lane.of} - 4px)`
		style.right = "auto"
	}
	if (row.busy) style.backgroundImage = "repeating-linear-gradient(135deg, #F6F3ED 0, #F6F3ED 6px, #ECE7DE 6px, #ECE7DE 7px)"
	else if (person) {
		const color = colorOf(person)
		style.background = `${color}1F`
		style.borderColor = `${color}66`
	}
	return style
}

function blockClass(row) {
	return [
		row.busy ? "cursor-default border-gray-200 text-gray-500 dark:border-gray-600" : "border-gray-300 hover:brightness-95",
		store.selectedKey === row.key ? "ring-2 ring-blue-500" : "",
	]
}

//// Neoffice — the cabin an appointment is in, or « To place » when it has none yet (NeoSalon, cabins level 2, 16.11.2026); nothing for a service that asks for none
function cabinChip(row) {
	const { cabin, needs } = cabinOf(row)
	if (cabin) return { label: cabin.label, color: cabin.color, needs: false }
	return needs ? { label: __("To place"), color: null, needs: true } : null
}

function pillText(row) {
	switch (standsAs(row)) {
		case "started":
			return row.clock?.state === "paused" ? __("In pause") : __("In progress")
		case "finished":
			return __("To collect")
		case "in_the_till":
			return __("In the till")
		case "to_handle":
			return __("To handle")
		case "paid":
			return __("Paid")
		case "absent":
			return __("Absent")
		default:
			return __("Booked")
	}
}

// An appointment dragged to another person or another hour of the day (NeoSalon B', 16.11.2026): the drop opens « Move » on what it proposes,
// with the window's own check and « Warn the customer ». A mouse or a pen drags at once. A finger drags after a long press (16.11:
// at the counter they work with a finger): held still LONG_PRESS_MS on an appointment, it takes it; moved before, it scrolls the agenda.
// While it drags, the mark says, a moment after it stops, whether the hour holds there (the same check as the window's).
const LONG_PRESS_MS = 450
const FINGER_SLOP_PX = 8
const FIT_AFTER_MS = 250
const drag = ref(null)
let draggedAt = 0
let pressTimer = null
let fitTimer = null
const justDragged = () => Date.now() - draggedAt < 400

function startDrag(event, row) {
	if (row.busy || !store.capabilities.move || row.can?.move === false || event.button !== 0) return
	const rect = event.currentTarget.getBoundingClientRect()
	const touch = event.pointerType === "touch"
	drag.value = { row, x: event.clientX, y: event.clientY, grab: event.clientY - rect.top, height: rect.height, moved: false, mark: null, touch, armed: !touch, fits: {} }
	window.addEventListener("pointermove", onDrag)
	window.addEventListener("pointerup", endDrag)
	window.addEventListener("pointercancel", stopDrag)
	if (touch) {
		pressTimer = setTimeout(() => {
			if (!drag.value || drag.value.row !== row) return
			drag.value.armed = true
			navigator.vibrate?.(15)
		}, LONG_PRESS_MS)
	}
}

// A finger that took an appointment moves it, not the page (the listener sits on the block, so the browser waits for it before scrolling)
function holdStill(event) {
	if (drag.value?.armed && event.cancelable) event.preventDefault()
}

function onDrag(event) {
	const d = drag.value
	if (!d) return
	const far = Math.hypot(event.clientX - d.x, event.clientY - d.y)
	if (!d.armed) {
		// the finger moved before the long press: it scrolls the agenda, nothing is dragged
		if (far > FINGER_SLOP_PX) stopDrag()
		return
	}
	if (!d.moved && far < 6) return
	d.moved = true
	const body = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-test^='column-']")
	const key = body ? body.getAttribute("data-test").slice("column-".length) : null
	const column = key === null ? null : store.columns.find((c) => String(c.key) === key)
	if (!column?.person) {
		d.mark = null
		clearTimeout(fitTimer)
		return
	}
	const time = dropTime(event.clientY - body.getBoundingClientRect().top - d.grab, store.range, PX_PER_HOUR)
	if (d.mark && d.mark.key === key && d.mark.time === time) return
	const [hours, minutes] = time.split(":").map(Number)
	d.mark = { key, person: column.person, time, top: offsetOf(hours * 60 + minutes, store.range, PX_PER_HOUR), height: d.height, fit: null }
	askFit(d)
}

// Whether it holds is asked once the pointer rests on a person and a quarter, and kept for the drag (back on a quarter already asked: said at once)
function askFit(d) {
	clearTimeout(fitTimer)
	if (!store.capabilities.check_move || !d.row.booking) return
	const at = `${d.mark.person.sales_person}|${d.mark.time}`
	if (at in d.fits) {
		d.mark.fit = d.fits[at]
		return
	}
	const { person, time } = d.mark
	fitTimer = setTimeout(async () => {
		const answer = await checkMove(d.row.booking, `${store.date} ${time}:00`, person.sales_person)
		const fit = answer ? { ok: Boolean(answer.ok), why: answer.why || "" } : null
		d.fits[at] = fit
		if (drag.value === d && d.mark && `${d.mark.person.sales_person}|${d.mark.time}` === at) d.mark.fit = fit
	}, FIT_AFTER_MS)
}

// The window's words: « This hour is free. », or the lane's own reason, or the general one when it gives none
function fitText(fit) {
	if (fit.ok) return __("This hour is free.")
	return fit.why || __("This hour is not possible.")
}

// The colour of the mark's border and of its label: the till's clay while nothing is said yet, then green or amber
function markClass(fit) {
	if (!fit) return "border-blue-500"
	return fit.ok ? "border-green-600" : "border-yellow-600"
}

function stopDrag() {
	clearTimeout(pressTimer)
	clearTimeout(fitTimer)
	window.removeEventListener("pointermove", onDrag)
	window.removeEventListener("pointerup", endDrag)
	window.removeEventListener("pointercancel", stopDrag)
	const d = drag.value
	drag.value = null
	return d
}

function endDrag() {
	const d = stopDrag()
	if (!d?.moved) return
	draggedAt = Date.now()
	if (!d.mark) return
	emit("move-to", { appointment: d.row, person: d.mark.person.sales_person, day: store.date, time: d.mark.time })
}

onBeforeUnmount(stopDrag)
onBeforeUnmount(() => stopFollowingTheNetwork?.())

function select(row) {
	store.select(row.key)
	emit("selected", row)
}

// The phone's list: the chips are the cashier's own column, then each person, then everybody
const phoneKey = ref(null)
const chips = computed(() => {
	const list = []
	const own = store.columns.find((column) => column.person && store.mine.includes(column.person.sales_person))
	if (own) list.push({ key: own.key, label: __("Me — {0}", [own.person.sales_person_name]), count: own.appointments.length })
	for (const column of store.columns) {
		if (column === own) continue
		list.push({ key: column.key, label: column.person ? column.person.sales_person_name : __("To assign"), count: column.appointments.length })
	}
	list.push({ key: "all", label: __("All"), count: store.appointments.length })
	return list
})
const selectedChip = computed(() => phoneKey.value || chips.value[0]?.key || "all")
const phonePerson = computed(() => store.columns.find((column) => column.key === selectedChip.value)?.person || null)
const phoneRows = computed(() => {
	const column = store.columns.find((item) => item.key === selectedChip.value)
	const rows = (column ? column.appointments : store.appointments).map((row) => ({ key: row.key, row }))
	const frees = column?.person && !store.closed ? freeHoursOf(column.person, column.appointments).map((free) => ({ key: `free-${free.from}`, free })) : []
	return [...rows, ...frees].sort((a, b) => (a.free ? a.free.from : minutesOf(a.row.starts_at)) - (b.free ? b.free.from : minutesOf(b.row.starts_at)))
})
</script>

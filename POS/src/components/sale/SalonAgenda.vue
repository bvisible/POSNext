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
			<div class="grid min-w-full" :style="{ gridTemplateColumns: `52px repeat(${store.columns.length}, minmax(168px, 1fr))` }">
				<div class="sticky top-0 left-0 z-30 bg-white dark:bg-gray-900" />
				<div
					v-for="column in store.columns"
					:key="`head-${column.key}`"
					class="sticky top-0 z-20 flex flex-col gap-1 border-b border-s border-gray-100 bg-white px-2 pb-2 pt-1.5 dark:border-gray-800 dark:bg-gray-900"
					:data-test="`column-head-${column.key}`"
				>
					<div class="flex items-center gap-2">
						<span v-if="column.person" class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[10px] font-bold text-white" :style="{ background: colorOf(column.person) }" aria-hidden="true">{{ initialsOf(column.person.sales_person_name) }}</span>
						<b class="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-100">{{ column.person ? column.person.sales_person_name : __("To assign") }}</b>
						<span v-if="standing(column.person)" class="flex-none rounded-full px-2 py-0.5 text-[11px] font-medium" :class="TONES[standing(column.person).tone]" :data-test="`column-standing-${column.key}`">{{ standing(column.person).label }}</span>
					</div>
					<div class="truncate text-xs text-gray-500 dark:text-gray-400">{{ hoursText(column.person) }}</div>
				</div>

				<div class="sticky left-0 z-10 bg-white text-[11px] text-gray-500 dark:bg-gray-900 dark:text-gray-400" :style="{ height: `${gridHeight}px` }">
					<div v-for="hour in hours" :key="hour" class="absolute end-1.5 -translate-y-1/2" :style="{ top: `${(hour - store.range.start) * PX_PER_HOUR}px` }">{{ clockOf(hour * 60) }}</div>
				</div>

				<div v-for="column in store.columns" :key="`col-${column.key}`" class="relative border-s border-gray-100 dark:border-gray-800" :style="{ height: `${gridHeight}px`, backgroundImage: lines, backgroundSize: `100% ${PX_PER_HOUR}px` }" :data-test="`column-${column.key}`">
					<!-- Not working that day: hatched, and said -->
					<div v-if="column.person && isOff(column.person)" class="absolute inset-0" :style="{ backgroundImage: HATCH }">
						<div class="absolute inset-x-3 top-24 rounded-lg border border-gray-200 bg-white px-3 py-3 text-center text-xs leading-snug text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300" :data-test="`column-off-${column.key}`">
							<b class="text-sm text-gray-800 dark:text-gray-100">{{ standing(column.person).label }}</b>
							<div v-if="column.person.reason" class="mt-0.5">{{ column.person.reason }}</div>
						</div>
					</div>
					<template v-else>
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
							@click="!row.busy && select(row)"
						>
							<span class="flex items-center justify-between gap-1">
								<b class="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-gray-900 dark:text-gray-100">
									<span v-if="!row.busy" class="h-2 w-2 flex-none rounded-full" :class="DOTS[standsAs(row)]" aria-hidden="true" />
									<span class="truncate">{{ row.busy ? __("Busy") : row.customer_name || __("Walk-in") }}</span>
								</b>
								<span class="flex-none tabular-nums text-gray-600 dark:text-gray-300">{{ hourOf(row.starts_at) }}</span>
							</span>
							<span v-if="!row.busy" class="truncate text-gray-700 dark:text-gray-200">{{ titleOf(row) }}</span>
							<span v-else class="truncate text-gray-500 dark:text-gray-400">{{ __("A colleague's appointment") }}</span>
							<span v-if="!row.busy && blockHeight(row) >= 64" class="mt-auto flex">
								<span class="rounded-full px-2 py-px text-[11px] font-medium" :class="PILLS[standsAs(row)]">{{ pillText(row) }}</span>
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
						<button v-if="item.free" type="button" class="flex-1 rounded-lg border-[1.5px] border-dashed border-gray-300 px-3 py-2.5 text-start text-sm text-gray-500 dark:border-gray-600" :disabled="!store.capabilities.book" :data-test="`free-${item.free.from}`" @click="emit('new-appointment', { person: phonePerson, from: item.free.from })">+ {{ __("Book an appointment") }}</button>
						<button v-else type="button" class="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border px-3 py-2 text-start" :class="blockClass(item.row)" :disabled="item.row.busy" :data-test="`row-${item.row.key}`" @click="!item.row.busy && select(item.row)">
							<b class="truncate text-[15px] text-gray-900 dark:text-gray-100">{{ item.row.busy ? __("Busy") : item.row.customer_name || __("Walk-in") }}</b>
							<span class="truncate text-sm text-gray-700 dark:text-gray-200">{{ item.row.busy ? __("A colleague's appointment") : titleOf(item.row) }}</span>
							<span v-if="!item.row.busy" class="mt-1 flex"><span class="rounded-full px-2 py-px text-xs font-medium" :class="PILLS[standsAs(item.row)]">{{ pillText(item.row) }}</span></span>
						</button>
					</li>
					<li v-if="!phoneRows.length" class="px-4 py-6 text-sm text-gray-500">{{ __("Nothing booked.") }}</li>
				</ul>
			</div>
		</div>

		<p v-else-if="store.loaded && !store.available" data-test="agenda-unavailable" class="px-4 py-6 text-sm text-gray-500">{{ __("The agenda is not available at this till.") }}</p>
		<p v-else-if="store.loaded" data-test="agenda-empty" class="px-4 py-6 text-sm text-gray-500">{{ __("Nobody is booked and the team is not set up for this day.") }}</p>
	</section>
</template>

<script setup>
/**
 * The agenda of the salon day (the store reads it from the site, composed from the planning, the money and the time lanes).
 *
 * emits `new-appointment` `{ person, from }` (a free hour, or the « New » button) and `selected` (an appointment's sheet should open).
 */
import { computed, ref } from "vue"
import { useAppointmentsStore } from "@/stores/appointments"
import { usePOSUIStore } from "@/stores/posUI"
import {
	avatarColorOf,
	blockGeometry,
	clockOf,
	freeHoursOf,
	hourOf,
	initialsOf,
	isOff,
	lengthOf,
	minutesLongOf,
	minutesOf,
	offsetOf,
	standingOf,
	standsAs,
	titleOf,
} from "@/utils/appointments"
import { offlineState } from "@/utils/offline/offlineState"

const emit = defineEmits(["new-appointment", "selected"])

const store = useAppointmentsStore()
const uiStore = usePOSUIStore()

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
	paid: "bg-green-600",
	absent: "bg-red-500",
}
const PILLS = {
	booked: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
	started: "bg-blue-50 text-blue-700 dark:bg-blue-400/20 dark:text-blue-100",
	finished: "bg-orange-50 text-orange-700 dark:bg-orange-400/20 dark:text-orange-100",
	in_the_till: "bg-blue-50 text-blue-700 dark:bg-blue-400/20 dark:text-blue-100",
	paid: "bg-green-50 text-green-700 dark:bg-green-400/20 dark:text-green-100",
	absent: "bg-red-50 text-red-700 dark:bg-red-400/20 dark:text-red-100",
}
const lines = "linear-gradient(to bottom, #EFEAE1 0, #EFEAE1 1px, transparent 1px)"

const offline = computed(() => offlineState.isOffline)
const gridHeight = computed(() => (store.range.end - store.range.start) * PX_PER_HOUR)
const hours = computed(() => Array.from({ length: store.range.end - store.range.start + 1 }, (_, at) => store.range.start + at))
const nowOffset = computed(() => {
	const top = offsetOf(store.now, store.range, PX_PER_HOUR)
	return top >= 0 && top <= gridHeight.value ? top : null
})
const dayTitle = computed(() => {
	const when = new Date(`${store.date}T12:00:00`)
	return Number.isNaN(when.getTime()) ? store.date : when.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
})
const keptAt = computed(() => (store.cachedAt ? new Date(store.cachedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""))
// The cashier's own column is where « New » starts; the first column otherwise
const defaultPerson = computed(() => {
	const own = store.columns.find((column) => column.person && store.mine.includes(column.person.sales_person))
	return (own || store.columns.find((column) => column.person))?.person || null
})

const colorOf = (person) => avatarColorOf(person.sales_person_name)
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
	return column.person ? freeHoursOf(column.person, column.appointments) : []
}

function blockHeight(row) {
	return blockGeometry(row, store.range, PX_PER_HOUR).height
}

function blockStyle(row, person) {
	const { top, height } = blockGeometry(row, store.range, PX_PER_HOUR)
	const style = { top: `${top + 1}px`, height: `${height}px` }
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

function pillText(row) {
	switch (standsAs(row)) {
		case "started":
			return row.clock?.state === "paused" ? __("In pause") : __("In progress")
		case "finished":
			return __("To collect")
		case "in_the_till":
			return __("In the till")
		case "paid":
			return __("Paid")
		case "absent":
			return __("Absent")
		default:
			return __("Booked")
	}
}

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
	const frees = column?.person ? freeHoursOf(column.person, column.appointments).map((free) => ({ key: `free-${free.from}`, free })) : []
	return [...rows, ...frees].sort((a, b) => (a.free ? a.free.from : minutesOf(a.row.starts_at)) - (b.free ? b.free.from : minutesOf(b.row.starts_at)))
})
</script>

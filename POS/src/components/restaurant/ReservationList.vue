<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Day list of reservations with date -->
	<!-- //// and status filters, and the transitions the host drives (confirm, seat, no show). -->
	<!-- //// Upstream POSNext has no reservations. (ebc3ecc5, 2026-03-29 "restaurant reservation -->
	<!-- //// system with POS dialog, online booking, and email notifications"; e4769383 the clay -->
	<!-- //// retheme.) -->
	<!-- //// A card per booking, by service (lunch, dinner), instead of one long row (NeoResto lot 1, product owner, 03.11.2026, -->
	<!-- //// « propose-moi quelque chose de sympa », the drawing validated the same day): the time large, how long until it (or how late), the name, the guests, -->
	<!-- //// the table and the channel, the note, a top edge and a pill in the colour of the status, and the gestures at the foot. -->
	<div class="reservation-list">
		<!-- Filters -->
		<div class="filters">
			<input
				type="date"
				:value="currentDate"
				class="filter-input"
				@change="$emit('date-change', $event.target.value)"
			/>
			<select
				class="filter-input"
				:value="selectedArea"
				@change="$emit('area-change', $event.target.value)"
			>
				<option value="">{{ __("All Areas") }}</option>
				<option v-for="area in areas" :key="area.name" :value="area.name">
					{{ area.label }}
				</option>
			</select>
			<select
				class="filter-input"
				:value="selectedStatus"
				@change="$emit('status-change', $event.target.value)"
			>
				<option value="">{{ __("All Statuses") }}</option>
				<option value="Pending">{{ __("Pending") }}</option>
				<option value="Confirmed">{{ __("Confirmed") }}</option>
				<option value="Seated">{{ __("Seated") }}</option>
				<option value="Completed">{{ __("Completed") }}</option>
				<option value="Cancelled">{{ __("Cancelled") }}</option>
				<option value="No Show">{{ __("No Show") }}</option>
			</select>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="loading-state">
			{{ __("Loading...") }}
		</div>

		<!-- Empty state -->
		<div v-else-if="filteredReservations.length === 0" class="empty-state">
			{{ __("No reservations for this date") }}
		</div>

		<!-- The day, by service -->
		<div v-else class="list-container">
			<div class="summary" data-summary>
				<span class="chip">
					<LucideCalendarDays class="chip-icon" aria-hidden="true" />{{ __("{0} reservations", [summary.reservations]) }}
				</span>
				<span class="chip"><LucideUsers class="chip-icon" aria-hidden="true" />{{ __("{0} guests", [summary.covers]) }}</span>
				<span v-if="summary.seated" class="chip">
					<LucideArmchair class="chip-icon" aria-hidden="true" />{{ __("{0} seated", [summary.seated]) }}
				</span>
			</div>

			<section v-for="service in services" :key="service.key" class="service" :data-service="service.key">
				<h3 class="service-title">
					{{ service.label }}
					<span class="service-count">{{ __("{0} reservations", [service.count]) }} · {{ __("{0} guests", [service.covers]) }}</span>
				</h3>
				<div class="cards">
					<article
						v-for="res in service.items"
						:key="res.name"
						class="res-card"
						:class="[`status-${statusKey(res)}`, { 'is-over': isOver(res) }]"
						data-reservation-card
						@click="$emit('select', res)"
					>
						<header class="card-top">
							<div>
								<div class="card-time">{{ res.reservation_time?.slice(0, 5) }}</div>
								<div v-if="whenOf(res)" class="card-when" :class="`when-${whenOf(res).tone}`" data-when>
									{{ whenOf(res).text }}
								</div>
							</div>
							<span class="status-tag" :class="`tag-${statusKey(res)}`">{{ __(res.status) }}</span>
						</header>

						<p class="card-name">{{ res.guest_name }}</p>

						<div class="card-meta">
							<span class="tag"><LucideUsers class="tag-icon" aria-hidden="true" />{{ __("{0} guests", [res.no_of_guests]) }}</span>
							<span v-if="tablesOf(res)" class="tag">
								<LucideArmchair class="tag-icon" aria-hidden="true" />{{ tablesOf(res) }}
							</span>
							<span v-if="res.channel" class="tag">
								<component :is="channelIcon(res.channel)" class="tag-icon" aria-hidden="true" />{{ __(res.channel) }}
							</span>
						</div>

						<p v-if="res.notes" class="card-note">{{ res.notes }}</p>

						<footer class="card-actions" @click.stop>
							<!-- The ✓ actions say what they do in words: a title is never seen on a touch screen, and a -->
							<!-- Confirmed booking that waits for its guest carries both (NeoResto lot 1, task 18) -->
							<button
								v-if="res.status === 'Confirmed'"
								type="button"
								class="go-btn"
								:title="__('Check-in')"
								data-action="check-in"
								@click="$emit('check-in', res)"
							>
								<LucideCheck class="btn-icon" aria-hidden="true" />{{ __("Arrived") }}
							</button>
							<!-- An online booking whose guest has not confirmed it from the e-mail can be confirmed for him (he -->
							<!-- phoned), Pending or already Confirmed: it then never expires (NeoResto lot 1, task 18) -->
							<button
								v-if="res.status === 'Pending' || res.awaits_guest"
								type="button"
								class="go-btn"
								:class="{ 'go-btn--quiet': res.status !== 'Pending' }"
								:title="__('Confirm')"
								data-action="confirm"
								@click="$emit('confirm', res)"
							>
								<LucideCheck class="btn-icon" aria-hidden="true" />{{
									res.status === "Pending" ? __("Confirm") : __("Confirmed by phone")
								}}
							</button>
							<span v-if="res.status === 'Seated'" class="at-table" data-at-table>
								<LucideCircleCheck class="btn-icon" aria-hidden="true" />{{ __("At the table") }}
							</span>

							<a
								v-if="res.phone && isOpen(res)"
								class="icon-btn"
								:href="`tel:${res.phone}`"
								:title="__('Call')"
								:aria-label="__('Call')"
								data-action="call"
							>
								<LucidePhoneCall aria-hidden="true" />
							</a>
							<button
								v-if="isOpen(res)"
								type="button"
								class="icon-btn"
								:title="__('Edit')"
								:aria-label="__('Edit')"
								data-action="edit"
								@click="$emit('select', res)"
							>
								<LucidePencil aria-hidden="true" />
							</button>
							<button
								v-if="['Pending', 'Confirmed'].includes(res.status)"
								type="button"
								class="icon-btn icon-btn--cancel"
								:title="__('Cancel')"
								:aria-label="__('Cancel')"
								data-action="cancel"
								@click="$emit('cancel', res)"
							>
								<LucideX aria-hidden="true" />
							</button>
							<button
								v-if="res.status === 'Confirmed'"
								type="button"
								class="icon-btn icon-btn--noshow"
								:title="__('No Show')"
								:aria-label="__('No Show')"
								data-action="no-show"
								@click="$emit('no-show', res)"
							>
								<LucideUserX aria-hidden="true" />
							</button>
						</footer>
					</article>
				</div>
			</section>
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from "vue"
import LucideArmchair from "~icons/lucide/armchair"
import LucideCalendarDays from "~icons/lucide/calendar-days"
import LucideCheck from "~icons/lucide/check"
import LucideCircleCheck from "~icons/lucide/circle-check"
import LucideFootprints from "~icons/lucide/footprints"
import LucideGlobe from "~icons/lucide/globe"
import LucidePencil from "~icons/lucide/pencil"
import LucidePhone from "~icons/lucide/phone"
import LucidePhoneCall from "~icons/lucide/phone-call"
import LucideUserX from "~icons/lucide/user-x"
import LucideUsers from "~icons/lucide/users"
import LucideX from "~icons/lucide/x"

const props = defineProps({
	reservations: { type: Array, default: () => [] },
	loading: { type: Boolean, default: false },
	currentDate: { type: String, default: "" },
	selectedArea: { type: String, default: "" },
	selectedStatus: { type: String, default: "" },
	// The rooms of the day's reservations: { name, label }, a room being shown by its label and chosen by its name
	areas: { type: Array, default: () => [] },
})

defineEmits([
	"date-change",
	"area-change",
	"status-change",
	"select",
	"check-in",
	"confirm",
	"cancel",
	"no-show",
])

// The bookings that no longer count for the day: nobody is coming, or nobody came
const OVER = ["Cancelled", "No Show", "Expired"]
// A booking before this hour is the lunch service, from it the dinner service
const DINNER_FROM = "15:00"
// A table late by more than this is late in red; one to come within this is to come, in the signal colour
const LATE_AFTER_MINUTES = 10
const SOON_WITHIN_MINUTES = 30

// The clock the « in 35 min » counts from, kept fresh while the list is open
const now = ref(new Date())
const tick = setInterval(() => {
	now.value = new Date()
}, 30000)
onBeforeUnmount(() => clearInterval(tick))

const filteredReservations = computed(() => {
	let list = props.reservations
	if (props.selectedArea) {
		list = list.filter((r) => r.tables?.some((t) => t.area === props.selectedArea))
	}
	if (props.selectedStatus) {
		list = list.filter((r) => r.status === props.selectedStatus)
	}
	return list
})

const counted = (res) => !OVER.includes(res.status)
const coversOf = (list) => list.filter(counted).reduce((sum, r) => sum + (Number(r.no_of_guests) || 0), 0)

const summary = computed(() => ({
	reservations: filteredReservations.value.filter(counted).length,
	covers: coversOf(filteredReservations.value),
	seated: filteredReservations.value.filter((r) => r.status === "Seated").length,
}))

// The day cut into its two services, a service with no booking left out
const services = computed(() => {
	const cut = [
		{ key: "lunch", label: __("Lunch", null, "Reservation service"), items: [] },
		{ key: "dinner", label: __("Dinner", null, "Reservation service"), items: [] },
	]
	for (const res of filteredReservations.value) {
		cut[(res.reservation_time || "").slice(0, 5) < DINNER_FROM ? 0 : 1].items.push(res)
	}
	return cut
		.filter((service) => service.items.length)
		.map((service) => ({
			...service,
			count: service.items.filter(counted).length,
			covers: coversOf(service.items),
		}))
})

const statusKey = (res) => (res.status || "").toLowerCase().replace(" ", "-")
const isOver = (res) => OVER.includes(res.status)
// A booking the host may still change: not over, not served
const isOpen = (res) => ["Pending", "Confirmed", "Seated"].includes(res.status)

function tablesOf(res) {
	const tables = res.tables || []
	if (!tables.length) return ""
	const names = tables.map((t) => t.table_name || t.restaurant_table).join(", ")
	const room = tables[0].area_name
	return room ? `${names} · ${room}` : names
}

function channelIcon(channel) {
	if (channel === "Internet") return LucideGlobe
	if (channel === "Walk-in") return LucideFootprints
	return LucidePhone
}

// 95 → "1 h 35", 40 → "40 min", 120 → "2 h"
function span(minutes) {
	const total = Math.max(0, Math.round(minutes))
	if (total < 60) return `${total} ${__("min")}`
	const hours = Math.floor(total / 60)
	const rest = total % 60
	return rest ? `${hours} ${__("h")} ${String(rest).padStart(2, "0")}` : `${hours} ${__("h")}`
}

const todayIso = computed(() => {
	const d = now.value
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
})

// What the card says under its time: how long until the guests, or how late they are (today's bookings still awaited), who has not confirmed,
// or that they sit at their table
function whenOf(res) {
	if (res.status === "Seated") return { text: __("At the table"), tone: "good" }
	if (res.status === "Pending" && res.awaits_guest) return { text: __("Awaiting the guest"), tone: "soon" }
	if (!["Pending", "Confirmed"].includes(res.status) || props.currentDate !== todayIso.value) return null
	const [hours, minutes] = (res.reservation_time || "").split(":").map(Number)
	if (Number.isNaN(hours)) return null
	const until = hours * 60 + (minutes || 0) - (now.value.getHours() * 60 + now.value.getMinutes())
	if (until >= 0) {
		return { text: __("in {0}", [span(until)]), tone: until <= SOON_WITHIN_MINUTES ? "soon" : "calm" }
	}
	return { text: __("{0} late", [span(-until)]), tone: -until > LATE_AFTER_MINUTES ? "late" : "soon" }
}
</script>

<style scoped>
/* //// Neoffice — the cards of the day: the design system's paper, sand and status tones (a pale face and a 4 px top edge, as the tiles of the card) */
.reservation-list {
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden;
}

.filters {
	display: flex;
	gap: 8px;
	padding: 8px 0;
	flex-shrink: 0;
}

.filter-input {
	padding: 6px 10px;
	border: 1px solid var(--border-color, #dcd4c7);
	border-radius: 10px;
	font-size: 13px;
	background: var(--control-bg, #fff);
	color: var(--text-color, #1f2937);
	flex: 1;
	min-width: 0;
}

.list-container {
	flex: 1;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-bottom: 8px;
}

.summary {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.chip,
.tag {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	border-radius: 8px;
	font-size: 12.5px;
	color: #3a342c;
}

.chip {
	background: #fff;
	border: 1px solid #ece7de;
	padding: 4px 10px;
}

.tag {
	background: #f6f3ed;
	padding: 3px 9px;
}

.chip-icon,
.tag-icon {
	width: 14px;
	height: 14px;
	flex: none;
}

.service {
	margin-top: 6px;
}

.service-title {
	display: flex;
	align-items: baseline;
	gap: 10px;
	margin: 6px 2px 8px;
	font-family: Forum, Georgia, serif;
	font-size: 19px;
	font-weight: 400;
	color: var(--heading-color, #141414);
}

.service-count {
	font-family: Karla, system-ui, sans-serif;
	font-size: 12px;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: #6f665a;
}

.cards {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
	gap: 10px;
}

.res-card {
	--edge: #4a6b8f;
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px 14px;
	border-radius: 12px;
	border: 1px solid #ece7de;
	border-top: 4px solid var(--edge);
	background: var(--card-bg, #fff);
	cursor: pointer;
	transition: box-shadow 0.15s;
}

.res-card:hover {
	box-shadow: 0 2px 10px rgba(20, 20, 20, 0.08);
}

.res-card.status-pending {
	--edge: #e0980f;
}

.res-card.status-seated {
	--edge: #1f9d57;
}

.res-card.status-completed,
.res-card.status-cancelled,
.res-card.status-expired {
	--edge: #bfb5a4;
}

.res-card.status-no-show {
	--edge: #dc4a3d;
}

.res-card.is-over {
	opacity: 0.62;
}

.res-card.status-cancelled .card-name {
	text-decoration: line-through;
}

.card-top {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 8px;
}

.card-time {
	font-family: Forum, Georgia, serif;
	font-size: 30px;
	line-height: 1;
	color: var(--heading-color, #141414);
}

.card-when {
	margin-top: 4px;
	font-size: 12px;
	color: #6f665a;
}

.when-soon {
	color: #aa3700;
}

.when-late {
	color: #9c2920;
}

.when-good {
	color: #11663a;
}

.status-tag {
	display: inline-block;
	padding: 3px 10px;
	border-radius: 999px;
	font-size: 12px;
	white-space: nowrap;
	background: #eef2f6;
	color: #2c4156;
}

.tag-pending {
	background: #fcf2dd;
	color: #92610c;
}

.tag-seated {
	background: #e9f7ee;
	color: #11663a;
}

.tag-completed,
.tag-cancelled,
.tag-expired {
	background: #ece7de;
	color: #524b41;
}

.tag-no-show {
	background: #fbebe7;
	color: #9c2920;
}

.card-name {
	margin: 0;
	font-size: 16px;
	font-weight: 500;
	color: var(--heading-color, #141414);
	overflow-wrap: anywhere;
}

.card-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.card-note {
	margin: 0;
	font-size: 12.5px;
	color: #6f665a;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.card-actions {
	display: flex;
	gap: 6px;
	margin-top: auto;
	padding-top: 2px;
}

/* 44px: the till is a touch screen (design system, NeoPOS hit targets) */
.go-btn,
.icon-btn,
.at-table {
	min-width: 44px;
	height: 44px;
	border-radius: 10px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	font-size: 14px;
}

.go-btn {
	flex: 1;
	border: 0;
	background: #141414;
	color: #fffdf8;
	cursor: pointer;
	white-space: nowrap;
}

/* The second way to confirm a booking already confirmed: quieter than the arrival */
.go-btn--quiet {
	background: #fff;
	color: #141414;
	border: 1px solid #dcd4c7;
}

.at-table {
	flex: 1;
	background: #e9f7ee;
	color: #11663a;
	padding: 0 12px;
}

.icon-btn {
	border: 1px solid #dcd4c7;
	background: #fff;
	color: #3a342c;
	cursor: pointer;
	text-decoration: none;
	font-size: 17px;
}

.icon-btn:hover {
	background: #f6f3ed;
}

.icon-btn--cancel:hover {
	background: #fbebe7;
	color: #9c2920;
	border-color: #f6d2c9;
}

.icon-btn--noshow:hover {
	background: #fcf2dd;
	color: #92610c;
	border-color: #f8e2b4;
}

.btn-icon {
	width: 16px;
	height: 16px;
	flex: none;
}

.loading-state,
.empty-state {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 1;
	color: var(--text-muted, #6b7280);
	font-size: 14px;
}

/* The dark screen: the colour of the status at 16 % over the card, the ink light */
:global(.dark) .res-card,
:global([data-theme="dark"]) .res-card {
	background: #1c1f26;
	border-color: rgba(255, 255, 255, 0.1);
	border-top-color: var(--edge);
}

:global(.dark) .card-time,
:global(.dark) .card-name,
:global([data-theme="dark"]) .card-time,
:global([data-theme="dark"]) .card-name {
	color: #f4f1ea;
}

:global(.dark) .chip,
:global(.dark) .tag,
:global([data-theme="dark"]) .chip,
:global([data-theme="dark"]) .tag {
	background: rgba(255, 255, 255, 0.08);
	border-color: rgba(255, 255, 255, 0.1);
	color: #dcd4c7;
}

:global(.dark) .status-tag,
:global([data-theme="dark"]) .status-tag {
	background: rgba(255, 255, 255, 0.1);
	color: #f4f1ea;
}

:global(.dark) .go-btn,
:global([data-theme="dark"]) .go-btn {
	background: #f4f1ea;
	color: #141414;
}

:global(.dark) .icon-btn,
:global([data-theme="dark"]) .icon-btn {
	background: transparent;
	border-color: rgba(255, 255, 255, 0.18);
	color: #dcd4c7;
}
</style>

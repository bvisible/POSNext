<!-- //// Neoffice — added file (no upstream equivalent). The tickets held on this device, to look at and to delete by choice (NeoResto lot 1, the product owner, 08.11.2026: « on tombe dessus, puis -->
<!-- //// on revient en arrière, on gère les brouillons […] savoir ce qu'on veut supprimer, garder ou cocher, décocher »). Each ticket has a checkbox; the ones left unchecked stay on the device, -->
<!-- //// the checked ones are deleted after a second tap. Used by the closing of the shift and by the sign-out dialogs. -->
<script setup>
import { computed, ref, watch } from "vue"
import { useToast } from "../../composables/useToast"
import { usePOSCartStore } from "../../stores/posCart"
import { usePOSDraftsStore } from "../../stores/posDrafts"
import { deleteDraft } from "../../utils/draftManager"
import { logger } from "../../utils/logger"
import { linesText } from "../../utils/stillOpenAtClosing"

const log = logger.create("HeldTicketsList")

const props = defineProps({
	// `heldTicketsOf`: { id, table, customer, lines, total, since, draft }
	tickets: { type: Array, default: () => [] },
	formatMoney: { type: Function, default: (value) => String(value) },
	tableLabel: { type: Function, default: (table) => table },
})
const emit = defineEmits(["changed"])

const { showSuccess, showError } = useToast()
const cartStore = usePOSCartStore()
const draftsStore = usePOSDraftsStore()

const chosen = ref(new Set())
const confirming = ref(false)
const working = ref(false)

// A ticket deleted elsewhere leaves the choice; a new selection asks for the confirmation again
watch(
	() => props.tickets.map((ticket) => ticket.id),
	(ids) => {
		chosen.value = new Set([...chosen.value].filter((id) => ids.includes(id)))
		confirming.value = false
	},
)

const allChosen = computed(() => props.tickets.length > 0 && chosen.value.size === props.tickets.length)

function toggle(id) {
	const next = new Set(chosen.value)
	if (next.has(id)) next.delete(id)
	else next.add(id)
	chosen.value = next
	confirming.value = false
}

function toggleAll() {
	chosen.value = allChosen.value ? new Set() : new Set(props.tickets.map((ticket) => ticket.id))
	confirming.value = false
}

function label(ticket) {
	if (ticket.table) return props.tableLabel(ticket.table)
	// A ticket with no table and no customer is just a held ticket (the bare « Walk-in » reads as a guest with no reservation in a restaurant)
	return ticket.customer || __("Held ticket")
}

function when(since) {
	if (!since) return ""
	const date = new Date(since)
	return Number.isNaN(date.getTime())
		? ""
		: date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

async function deleteChosen() {
	if (!chosen.value.size || working.value) return
	if (!confirming.value) {
		confirming.value = true
		return
	}
	working.value = true
	try {
		let deleted = 0
		for (const ticket of props.tickets.filter((candidate) => chosen.value.has(candidate.id))) {
			await deleteDraft(ticket.id)
			// The ticket open in the cart keeps its serials in the cart
			if (ticket.id !== cartStore.currentDraftId) draftsStore.returnDraftSerials(ticket.draft)
			deleted += 1
		}
		chosen.value = new Set()
		confirming.value = false
		await draftsStore.loadDrafts()
		showSuccess(__("{0} held tickets deleted", [deleted]))
		emit("changed")
	} catch (error) {
		log.warn("Could not delete the held tickets", error)
		showError(__("Failed to delete draft"))
	} finally {
		working.value = false
	}
}
</script>

<template>
	<div v-if="tickets.length" class="mt-2 rounded-lg border border-amber-200 bg-white" data-test="held-tickets-list">
		<label class="flex items-center gap-2 border-b border-amber-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
			<input type="checkbox" :checked="allChosen" data-test="held-ticket-all" @change="toggleAll" />
			{{ __("Select all") }}
		</label>
		<ul class="max-h-40 overflow-y-auto">
			<li v-for="ticket in tickets" :key="ticket.id" class="flex items-center gap-2 px-3 py-1.5 text-sm" data-test="held-ticket">
				<input
					type="checkbox"
					:checked="chosen.has(ticket.id)"
					:aria-label="label(ticket)"
					data-test="held-ticket-check"
					@change="toggle(ticket.id)"
				/>
				<span class="min-w-0 flex-1 truncate">
					<span class="font-semibold text-gray-900">{{ label(ticket) }}</span>
					<span class="text-xs text-gray-600"> · {{ linesText(ticket.lines) }} · {{ when(ticket.since) }}</span>
				</span>
				<span class="flex-shrink-0 font-semibold text-gray-900">{{ formatMoney(ticket.total) }}</span>
			</li>
		</ul>
		<div class="flex items-center justify-between gap-2 border-t border-amber-100 px-3 py-1.5">
			<span class="text-xs text-gray-600">{{ __("The tickets left unchecked stay on this device.") }}</span>
			<button
				type="button"
				class="rounded-md border px-2 py-0.5 text-xs font-semibold disabled:opacity-40"
				:class="confirming ? 'border-red-600 bg-red-600 text-white' : 'border-gray-300 bg-white text-gray-800'"
				:disabled="!chosen.size || working"
				data-test="held-ticket-delete"
				@click="deleteChosen"
			>
				{{ confirming ? __("Confirm: delete {0}", [chosen.size]) : __("Delete the selection") }}
			</button>
		</div>
	</div>
</template>

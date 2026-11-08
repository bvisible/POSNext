<!-- //// Neoffice — added file (no upstream equivalent). The notice of the sign-out dialogs (NeoResto lot 1, the product owner, 08.11.2026): signing out used to erase, in silence, the tickets held -->
<!-- //// on this device (cleanupUserSession → clearAllDrafts). They are kept now, for their owner, and the dialog says how many wait, lets the user look at them and delete the ones he does not -->
<!-- //// want, by choice. It stops nobody. Reads the device each time the dialog opens, since the dialog body is mounted only while it is shown. -->
<script setup>
import { computed, onMounted, ref } from "vue"
import { useFormatters } from "../../composables/useFormatters"
import { usePOSShiftStore } from "../../stores/posShift"
import { useRestaurantStore } from "../../stores/restaurant"
import { currentUser } from "../../utils/draftOwner"
import { getAllDrafts } from "../../utils/draftManager"
import { logger } from "../../utils/logger"
import { heldTicketsNotice, heldTicketsOf } from "../../utils/stillOpenAtClosing"
import HeldTicketsList from "./HeldTicketsList.vue"

const log = logger.create("HeldTicketsNotice")
const shiftStore = usePOSShiftStore()
const restaurantStore = useRestaurantStore()
const { formatCurrency } = useFormatters()
const held = ref([])
const showList = ref(false)

async function load() {
	try {
		held.value = heldTicketsOf(await getAllDrafts(), shiftStore.profileName, currentUser())
	} catch (error) {
		log.warn("Could not read the held tickets of this device", error)
	}
}

onMounted(load)

const notice = computed(() => heldTicketsNotice(held.value.length))
const tableLabel = (table) => restaurantStore.tableLabel?.(table) || table
</script>

<template>
	<div
		v-if="held.length"
		class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
		data-test="held-tickets-notice"
	>
		<p>
			{{ notice }}
			<button type="button" class="ms-1 font-semibold underline" data-test="held-tickets-toggle" @click="showList = !showList">
				{{ showList ? __("Hide them") : __("See them") }}
			</button>
		</p>
		<HeldTicketsList
			v-if="showList"
			:tickets="held"
			:format-money="formatCurrency"
			:table-label="tableLabel"
			@changed="load"
		/>
	</div>
</template>

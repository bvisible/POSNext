<!-- //// Neoffice — added file (no upstream equivalent). The notice of the sign-out dialogs (NeoResto lot 1, the product owner, -->
<!-- //// 08.11.2026): signing out clears the tickets held on this device (cleanupUserSession → clearAllDrafts), silently until -->
<!-- //// now. The dialog says how many it will erase, and does not stop anyone. Reads the device each time the dialog opens, -->
<!-- //// since the dialog body is mounted only while it is shown. -->
<script setup>
import { computed, onMounted, ref } from "vue"
import { usePOSShiftStore } from "../../stores/posShift"
import { getAllDrafts } from "../../utils/draftManager"
import { logger } from "../../utils/logger"
import { heldTicketsNotice, heldTicketsOf } from "../../utils/stillOpenAtClosing"

const log = logger.create("HeldTicketsNotice")
const shiftStore = usePOSShiftStore()
const held = ref([])

onMounted(async () => {
	try {
		held.value = heldTicketsOf(await getAllDrafts(), shiftStore.profileName)
	} catch (error) {
		log.warn("Could not read the held tickets of this device", error)
	}
})

const notice = computed(() => heldTicketsNotice(held.value.length))
</script>

<template>
	<div
		v-if="held.length"
		class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
		data-test="held-tickets-notice"
	>
		{{ notice }}
	</div>
</template>

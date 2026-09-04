//// Neoffice — Biome reformat only: the draftManager import exploded onto one name per
//// line (458d81a9, 2026-03-20 "remove BrainWise branding, add restaurant mode, and code
//// formatting"). The real divergence of this file is the restaurant table and
//// KDS state carried on a parked ticket, marked further down.
//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
import {
	deleteDraft,
	getDraftsCount,
	saveDraft,
	getAllDrafts,
	updateDraft,
} from "@/utils/draftManager"
import { useToast } from "@/composables/useToast"
import { defineStore } from "pinia"
import { ref } from "vue"

export const usePOSDraftsStore = defineStore("posDrafts", () => {
	// Use custom toast
	const { showSuccess, showError, showWarning } = useToast()

	// State
	const draftsCount = ref(0)
	const drafts = ref([])

	// Actions
	async function updateDraftsCount() {
		try {
			draftsCount.value = await getDraftsCount()
		} catch (error) {
			console.error("Error getting drafts count:", error)
		}
	}

	async function loadDrafts() {
		try {
			drafts.value = await getAllDrafts()
			draftsCount.value = drafts.value.length
		} catch (error) {
			console.error("Error loading drafts:", error)
		}
	}

	async function saveDraftInvoice(
		invoiceItems,
		customer,
		posProfile,
		appliedOffers = [],
		draftId = null,
		//// Neoffice — a parked ticket in a restaurant has to remember which table it belongs to and
		//// where the kitchen is with it; upstream's draft is retail and carries neither (458d81a9,
		//// 2026-03-20 "remove BrainWise branding, add restaurant mode, and code formatting").
		restaurantTable = null,
		kdsStatus = null,
	) {
		if (invoiceItems.length === 0) {
			showWarning(__("Cannot save an empty cart as draft"))
			return null
		}

		try {
			const draftData = {
				pos_profile: posProfile,
				customer: customer,
				items: invoiceItems,
				applied_offers: appliedOffers, // Save applied offers
				//// Neoffice — and the same two fields inside the stored draft payload, so re-opening the
				//// draft puts the ticket back on its table (458d81a9, 2026-03-20).
				restaurant_table: restaurantTable,
				kds_status: kdsStatus,
			}

			let savedDraft
			if (draftId) {
				savedDraft = await updateDraft(draftId, draftData)
			} else {
				savedDraft = await saveDraft(draftData)
			}

			await loadDrafts() // Refresh drafts list and count

			showSuccess(__("Invoice saved as draft successfully"))

			return savedDraft
		} catch (error) {
			console.error("Error saving draft:", error)
			showError(__("Failed to save draft"))
			return null
		}
	}

	async function loadDraft(draft) {
		try {
			showSuccess(__("Draft invoice loaded successfully"))

			return {
				items: draft.items || [],
				customer: draft.customer,
				applied_offers: draft.applied_offers || [], // Restore applied offers
			}
		} catch (error) {
			console.error("Error loading draft:", error)
			showError(__("Failed to load draft"))
			throw error
		}
	}

	async function deleteDraftById(draftId) {
		try {
			await deleteDraft(draftId)
			await loadDrafts() // Refresh drafts list and count
			showSuccess(__("Draft deleted successfully"))
		} catch (error) {
			console.error("Error deleting draft:", error)
			showError(__("Failed to delete draft"))
		}
	}

	return {
		// State
		draftsCount,
		drafts,

		// Actions
		updateDraftsCount,
		loadDrafts,
		saveDraftInvoice,
		loadDraft,
		deleteDraft: deleteDraftById,
	}
})

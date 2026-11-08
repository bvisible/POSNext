//// Neoffice — Biome reformat only: the draftManager import exploded onto one name per
//// line (458d81a9, 2026-03-20 "remove BrainWise branding, add restaurant mode, and code
//// formatting"). The real divergence of this file is the restaurant table and
//// KDS state carried on a parked ticket, marked further down.
//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
import {
	deleteDraft,
	saveDraft,
	getAllDrafts,
	updateDraft,
} from "@/utils/draftManager";
import { useToast } from "@/composables/useToast";
//// Neoffice — a held ticket carries its owner and is shown to him alone: signing out no longer erases them (NeoResto lot 1, 08.11.2026).
import { draftIsMine, withOwner } from "@/utils/draftOwner";
import { useSerialNumberStore } from "@/stores/serialNumber";
import { defineStore } from "pinia";
import { ref } from "vue";

export const usePOSDraftsStore = defineStore("posDrafts", () => {
	// Use custom toast
	const { showSuccess, showError, showWarning } = useToast();
	const serialStore = useSerialNumberStore();

	// State
	const draftsCount = ref(0);
	const drafts = ref([]);

	// Actions
	async function updateDraftsCount() {
		try {
			//// Neoffice — the user's own held tickets: the device may hold a colleague's (08.11.2026)
			draftsCount.value = (await getAllDrafts()).filter((draft) => draftIsMine(draft)).length;
		} catch (error) {
			console.error("Error getting drafts count:", error);
		}
	}

	async function loadDrafts() {
		try {
			//// Neoffice — the user's own held tickets only (utils/draftOwner; 08.11.2026)
			drafts.value = (await getAllDrafts()).filter((draft) => draftIsMine(draft));
			draftsCount.value = drafts.value.length;
		} catch (error) {
			console.error("Error loading drafts:", error);
		}
	}

	async function saveDraftInvoice(
		invoiceItems,
		customer,
		posProfile,
		appliedOffers = [],
		draftId = null,
		appliedCoupon = null,
		//// Neoffice — a parked ticket in a restaurant has to remember which table it belongs to and
		//// where the kitchen is with it; upstream's draft is retail and carries neither (458d81a9,
		//// 2026-03-20 "remove BrainWise branding, add restaurant mode, and code formatting").
		//// Kept after upstream develop's appliedCoupon, which its callers pass in sixth position.
		restaurantTable = null,
		kdsStatus = null
	) {
		if (invoiceItems.length === 0) {
			showWarning(__("Cannot save an empty cart as draft"));
			return null;
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
				// Scoped coupons live on the lines; the coupon must travel with them.
				applied_coupon: appliedCoupon?.line_level ? appliedCoupon : null,
			};

			//// Neoffice — a held ticket is written with its owner (utils/draftOwner; 08.11.2026)
			let savedDraft;
			if (draftId) {
				savedDraft = await updateDraft(draftId, withOwner(draftData));
			} else {
				//// Neoffice — with its owner as well (utils/draftOwner)
				savedDraft = await saveDraft(withOwner(draftData));
			}

			await loadDrafts(); // Refresh drafts list and count

			showSuccess(__("Invoice held"));

			return savedDraft;
		} catch (error) {
			console.error("Error saving draft:", error);
			showError(__("Failed to save draft"));
			return null;
		}
	}

	async function loadDraft(draft) {
		try {
			showSuccess(__("Held invoice opened"));

			return {
				items: draft.items || [],
				customer: draft.customer,
				applied_offers: draft.applied_offers || [], // Restore applied offers
				applied_coupon: draft.applied_coupon || null,
			};
		} catch (error) {
			console.error("Error loading draft:", error);
			showError(__("Failed to load draft"));
			throw error;
		}
	}

	// Return a parked draft's serials to the offline cache
	function returnDraftSerials(draft) {
		for (const item of draft?.items || []) {
			if (item.has_serial_no && item.serial_no) {
				serialStore.returnSerials(item.item_code, item.serial_no);
			}
		}
	}

	/**
	 * @param {{ returnSerials?: boolean }} [options]
	 *   true when the user discards the draft; false (default) after the draft was sold
	 */
	async function deleteDraftById(draftId, { returnSerials = false } = {}) {
		try {
			const draft = drafts.value.find((d) => d.draft_id === draftId);
			await deleteDraft(draftId);
			if (returnSerials) returnDraftSerials(draft);
			await loadDrafts(); // Refresh drafts list and count
			showSuccess(__("Draft deleted successfully"));
		} catch (error) {
			console.error("Error deleting draft:", error);
			showError(__("Failed to delete draft"));
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
		returnDraftSerials,
	};
});

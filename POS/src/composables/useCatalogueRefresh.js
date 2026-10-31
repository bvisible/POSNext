/**
 * //// Neoffice — added file (no upstream equivalent). What a till does when its own settings screen changed what it
 * //// sells (NeoRestau lot 1, task 13): its price list, its item groups, its brands, the unavailable items, the
 * //// variants, the pricing rules, its warehouse. It does what its refresh button does (POSSale.handleRefresh): the
 * //// items are fetched from the SERVER. A plain reload is not enough: once the till has had fresh items this session,
 * //// loadAllItems serves the browser's copy (IndexedDB), which keeps the old prices, and a cart line takes the price
 * //// the till shows. The till's groups and brands are read again too (the tabs), and a group or a brand the till no
 * //// longer offers is no longer selected.
 */
import { watch } from "vue"
import { usePOSEvents } from "@/composables/usePOSEvents"
import { useItemSearchStore } from "@/stores/itemSearch"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { usePOSShiftStore } from "@/stores/posShift"
import { useStockStore } from "@/stores/stock"
import { logger } from "@/utils/logger"

const log = logger.create("CatalogueRefresh")

export const CATALOGUE_CHANGED = "settings:catalogue-changed"

// The longest a load already under way (a new warehouse's own reload) is waited for
const IDLE_TIMEOUT_MS = 15000

/** Resolves once the item store has no load under way: the server's answer must be the last one written. */
function whenIdle(itemStore) {
	if (!itemStore.loading) return Promise.resolve()
	return new Promise((resolve) => {
		let stop = null
		const timer = setTimeout(() => {
			stop?.()
			resolve()
		}, IDLE_TIMEOUT_MS)
		stop = watch(
			() => itemStore.loading,
			(loading) => {
				if (loading) return
				clearTimeout(timer)
				stop?.()
				resolve()
			}
		)
	})
}

function offeredGroups(itemStore) {
	const names = new Set()
	for (const group of itemStore.itemGroups || []) {
		names.add(group.item_group)
		for (const child of group.child_groups || []) names.add(child)
	}
	return names
}

export async function refreshTheCatalogue({ itemStore, posSettingsStore, stockStore, profile, warehouse, changes = [] }) {
	if (!profile) return
	await whenIdle(itemStore)
	// The variants are asked for as the till's settings say: those just saved, before the items are fetched
	if (changes.includes("show_variants_as_items")) await posSettingsStore.reloadSettings()
	await itemStore.reloadPosProfile(profile)
	if (changes.includes("custom_brands_table") || itemStore.brands?.length) await itemStore.loadBrands()

	const groups = offeredGroups(itemStore)
	if (itemStore.selectedItemGroup && groups.size && !groups.has(itemStore.selectedItemGroup)) {
		itemStore.selectedItemGroup = null
	}
	const brands = new Set((itemStore.brands || []).map((row) => row.brand))
	if (itemStore.selectedBrand && brands.size && !brands.has(itemStore.selectedBrand)) {
		itemStore.selectedBrand = null
	}

	itemStore.invalidateCache()
	await Promise.all([itemStore.loadAllItems(profile, true), stockStore.refresh(null, warehouse)])
}

export function useCatalogueRefresh() {
	const itemStore = useItemSearchStore()
	const posSettingsStore = usePOSSettingsStore()
	const shiftStore = usePOSShiftStore()
	const stockStore = useStockStore()
	const { on } = usePOSEvents()
	on(CATALOGUE_CHANGED, async (payload = {}) => {
		try {
			await refreshTheCatalogue({
				itemStore,
				posSettingsStore,
				stockStore,
				profile: shiftStore.profileName,
				warehouse: shiftStore.profileWarehouse,
				changes: payload.changes || [],
			})
		} catch (error) {
			log.error("Error reloading the items after a settings change:", error)
		}
	})
}

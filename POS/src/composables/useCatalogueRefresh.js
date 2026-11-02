/**
 * //// Neoffice — added file (no upstream equivalent). What a till does when its own settings screen changed what it
 * //// sells (NeoResto lot 1, task 13): its price list, its item groups, its brands, the unavailable items, the
 * //// variants, the pricing rules, its warehouse. It does what its refresh button does (POSSale.handleRefresh): the
 * //// items are fetched from the SERVER. A plain reload is not enough: once the till has had fresh items this session,
 * //// loadAllItems serves the browser's copy (IndexedDB), which keeps the old prices, and a cart line takes the price
 * //// the till shows. The till's groups and brands are read again too (the tabs), and a group or a brand the till no
 * //// longer offers is no longer selected. What the new settings take out of the catalogue leaves the browser's copy
 * //// before the items are asked for again; the group tab, brand and search the till has open are fetched again after
 * //// the load; and a cart already started keeps the prices it announced, which the till says once (ruling 81).
 */
import { watch } from "vue"
import { usePOSEvents } from "@/composables/usePOSEvents"
import { useToast } from "@/composables/useToast"
import { useItemSearchStore } from "@/stores/itemSearch"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { usePOSShiftStore } from "@/stores/posShift"
import { useStockStore } from "@/stores/stock"
import { logger } from "@/utils/logger"
import { offlineWorker } from "@/utils/offline/workerClient"

const log = logger.create("CatalogueRefresh")

export const CATALOGUE_CHANGED = "settings:catalogue-changed"

// The longest a load already under way (a new warehouse's own reload) is waited for
const IDLE_TIMEOUT_MS = 15000
// What can take items OUT of what the till offers: the browser's copy is cleared before the items are asked for again,
// as the store's own recovery does (attemptFullCacheRecovery). It is only ever added to (cacheItems, the background
// sync), so a dropped item would come back through an empty server search, a page read from the copy, or offline
const DROPPING = ["item_groups", "custom_brands_table", "hide_unavailable_items", "show_variants_as_items"]
// What reprices what the till sells
const PRICING = ["selling_price_list"]

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

export async function refreshTheCatalogue({
	itemStore,
	posSettingsStore,
	stockStore,
	cartStore,
	toast,
	profile,
	warehouse,
	changes = [],
}) {
	if (!profile) return
	// A sale in progress keeps the prices it announced (ruling 81): its lines are not repriced, and the till says so
	// once, not for each line
	if (changes.some((key) => PRICING.includes(key)) && cartStore?.invoiceItems?.length) {
		toast?.showWarning?.(__("Items already in the cart keep their price"))
	}
	await whenIdle(itemStore)
	// The variants are asked for as the till's settings say: those just saved, before the items are fetched
	if (changes.includes("show_variants_as_items")) await posSettingsStore.reloadSettings()
	await itemStore.reloadPosProfile(profile)
	if (changes.includes("custom_brands_table") || itemStore.brands?.length) await itemStore.loadBrands()

	// The view the till has open: its group tab or its brand, kept while the till still offers it, and its search
	const groups = offeredGroups(itemStore)
	const group = itemStore.selectedItemGroup
	const keptGroup = group && (!groups.size || groups.has(group)) ? group : null
	if (group && !keptGroup) itemStore.selectedItemGroup = null
	const brands = new Set((itemStore.brands || []).map((row) => row.brand))
	const brand = itemStore.selectedBrand
	const keptBrand = brand && (!brands.size || brands.has(brand)) ? brand : null
	if (brand && !keptBrand) itemStore.selectedBrand = null
	const term = itemStore.searchTerm

	if (changes.some((key) => DROPPING.includes(key))) await offlineWorker.clearItemsCache()
	itemStore.invalidateCache()
	await Promise.all([itemStore.loadAllItems(profile, true), stockStore.refresh(null, warehouse)])

	// The load fetched the profile's first group; a search reads its own results: both fetched again, from the server
	if (keptGroup) await itemStore.setSelectedItemGroup(keptGroup)
	else if (keptBrand) await itemStore.setSelectedBrand(keptBrand)
	if (term?.trim()) await itemStore.searchItems(term)
}

export function useCatalogueRefresh() {
	const itemStore = useItemSearchStore()
	const posSettingsStore = usePOSSettingsStore()
	const shiftStore = usePOSShiftStore()
	const stockStore = useStockStore()
	const cartStore = usePOSCartStore()
	const toast = useToast()
	const { on } = usePOSEvents()
	on(CATALOGUE_CHANGED, async (payload = {}) => {
		try {
			await refreshTheCatalogue({
				itemStore,
				posSettingsStore,
				stockStore,
				cartStore,
				toast,
				profile: shiftStore.profileName,
				warehouse: shiftStore.profileWarehouse,
				changes: payload.changes || [],
			})
		} catch (error) {
			log.error("Error reloading the items after a settings change:", error)
		}
	})
}

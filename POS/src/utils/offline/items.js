//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
//// Neoffice — WHOLE FILE: formatting only, no behaviour change ▼▼▼
//// Every hunk of this file between the fork point and HEAD comes from the Biome
//// pass of 458d81a9 (2026-03-20 "remove BrainWise branding, add restaurant mode,
//// and code formatting"), run with POS/biome.json: semicolons "asNeeded", quoteStyle "double",
//// indentStyle "tab", lineWidth 80.
//// Concretely: semicolons dropped, ' -> ", arrow parens (word => became (word) =>),
//// re-wrapping at 80 columns, trailing commas, and searchCachedCustomers re-indented
//// from spaces to tabs. Not one line of logic differs from upstream here — no
//// restaurant code, no offline hardening, no Neoffice behaviour at all.
//// At the next upstream merge: take BrainWise's version of this file wholesale and
//// re-run `biome check --write`. Resolving these hunks by hand buys nothing and
//// risks dropping an upstream fix hidden inside the reformatting noise.
import { db, getSetting, setSetting } from "./db"

// Cache items in IndexedDB
export const cacheItems = async (items, priceList = null) => {
	try {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		if (!items || items.length === 0) return

		// Process items with barcodes
		const processedItems = items.map((item) => ({
			...item,
			barcodes: item.item_barcode
				? Array.isArray(item.item_barcode)
					? item.item_barcode.map((b) => b.barcode).filter(Boolean)
					: [item.item_barcode]
				: [],
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		}))

		// Save to items table
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		await db.items.bulkPut(processedItems)

		// Save prices if price list is provided
		if (priceList) {
			const prices = items.map((item) => ({
				price_list: priceList,
				item_code: item.item_code,
				rate: item.rate || item.price_list_rate || 0,
				timestamp: Date.now(),
			//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
			}))
			await db.item_prices.bulkPut(prices)
		}

		// Update last sync time
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		await setSetting("items_last_sync", Date.now())

		console.log(`Cached ${items.length} items`)
		return true
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error caching items:", error)
		return false
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

// Get cached items
export const getCachedItems = async (limit = 100) => {
	try {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		const items = await db.items.limit(limit).toArray()
		return items
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error getting cached items:", error)
		return []
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

// Fuzzy search: matches if any search word is contained in item text
//// Neoffice — still inside the whole-file formatting-only region opened at the top:
//// the fuzzy scoring below (exact 1000 / code 900 / prefix 500-400 / else 100) is
//// upstream's, only re-punctuated by Biome (458d81a9).
export const searchCachedItems = async (searchTerm, limit = 50) => {
	try {
		if (!searchTerm) {
			//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
			return await db.items.limit(limit).toArray()
		}

		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		const term = searchTerm.toLowerCase().trim()
		const searchWords = term.split(/\s+/).filter(Boolean)
		const allItems = await db.items.limit(limit * 10).toArray()

		// Filter and score items
		const results = allItems
			.map((item) => {
				//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
				const searchable =
					`${item.item_code || ""} ${item.item_name || ""} ${item.description || ""}`.toLowerCase()

				// Word-order independent: all words must appear somewhere
				//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
				if (!searchWords.every((word) => searchable.includes(word))) return null

				// Score: prefer exact and prefix matches
				//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
				let score = 0
				if (item.item_name?.toLowerCase() === term) score = 1000
				else if (item.item_code?.toLowerCase() === term) score = 900
				else if (item.item_name?.toLowerCase().startsWith(term)) score = 500
				else if (item.item_code?.toLowerCase().startsWith(term)) score = 400
				else score = 100

				return { item, score }
			})
			.filter(Boolean)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
			.map(({ item }) => item)

		return results
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error searching cached items:", error)
		return []
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

// Get item by barcode
export const getItemByBarcode = async (barcode) => {
	try {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		const item = await db.items.where("barcodes").equals(barcode).first()
		return item
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error getting item by barcode:", error)
		return null
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

// Get cached variants for a template item
export const getCachedVariants = async (templateItemCode) => {
	try {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		if (!templateItemCode) return []

		// Query items where variant_of equals the template item code
		const variants = await db.items
			.where("variant_of")
			.equals(templateItemCode)
			//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
			.toArray()

		return variants
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error getting cached variants:", error)
		return []
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

// Get cached batch data for an item
export const getCachedBatchData = async (itemCode) => {
	try {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		if (!itemCode) return []

		const item = await db.items.get(itemCode)
		return item?.batch_no_data || []
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error getting cached batch data:", error)
		return []
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

// Get cached serial number data for an item
export const getCachedSerialData = async (itemCode) => {
	try {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		if (!itemCode) return []

		const item = await db.items.get(itemCode)
		return item?.serial_no_data || []
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error getting cached serial data:", error)
		return []
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

// Update batch/serial data for items in cache
export const updateItemBatchSerialData = async (batchSerialDataMap) => {
	try {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		if (!batchSerialDataMap || Object.keys(batchSerialDataMap).length === 0)
			return

		// Update each item with its batch/serial data
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		const updates = Object.entries(batchSerialDataMap).map(
			async ([itemCode, data]) => {
				const item = await db.items.get(itemCode)
				if (item) {
					await db.items.update(itemCode, {
						batch_no_data: data.batch_no_data || [],
						serial_no_data: data.serial_no_data || [],
					})
				}
			},
		)

		await Promise.all(updates)
		console.log(
			`Updated batch/serial data for ${Object.keys(batchSerialDataMap).length} items`,
		)
		return true
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error updating batch/serial data:", error)
		return false
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

// Get item with price
export const getItemWithPrice = async (itemCode, priceList) => {
	try {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		const item = await db.items.get(itemCode)
		if (!item) return null

		if (priceList) {
			const price = await db.item_prices.get({
				price_list: priceList,
				item_code: itemCode,
			//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
			})
			if (price) {
				item.rate = price.rate
				item.price_list_rate = price.rate
			}
		}

		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		return item
	} catch (error) {
		console.error("Error getting item with price:", error)
		return null
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

// Cache customers
export const cacheCustomers = async (customers) => {
	try {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		if (!customers || customers.length === 0) return

		await db.customers.bulkPut(customers)
		await setSetting("customers_last_sync", Date.now())

		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.log(`Cached ${customers.length} customers`)
		return true
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error caching customers:", error)
		return false
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

// Search cached customers
//// Neoffice — the widest hunk of this file, and still formatting only: upstream had
//// this one function indented with SPACES while the rest of the file used tabs, so
//// Biome re-indented every line of the body (458d81a9). The Dexie startsWithIgnoreCase
//// query is untouched — note it is NOT the tokenized customer search, which lives in
//// cache.js and offline.worker.js (d29af088).
export const searchCachedCustomers = async (searchTerm, limit = 20) => {
	//// Neoffice — Biome reformat only, as announced in the block just above (458d81a9).
	try {
		if (!searchTerm) {
			return limit > 0
				? await db.customers.limit(limit).toArray()
				: await db.customers.toArray()
		}

		const term = searchTerm.toLowerCase()

		const query = db.customers
			.where("customer_name")
			.startsWithIgnoreCase(term)
			.or("mobile_no")
			.startsWithIgnoreCase(term)
			.or("email_id")
			.startsWithIgnoreCase(term)

		const results = await (limit > 0
			? query.limit(limit).toArray()
			: query.toArray())

		return results
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error searching cached customers:", error)
		return []
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

// Get items last sync time
export const getItemsLastSync = async () => {
	//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
	return await getSetting("items_last_sync", null)
}

// Get customers last sync time
export const getCustomersLastSync = async () => {
	//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
	return await getSetting("customers_last_sync", null)
}

// Check if cache is fresh (less than 24 hours old)
export const isCacheFresh = async (type = "items") => {
	//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
	const lastSync =
		type === "items" ? await getItemsLastSync() : await getCustomersLastSync()

	//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
	if (!lastSync) return false

	const hoursSinceSync = (Date.now() - lastSync) / (1000 * 60 * 60)
	return hoursSinceSync < 24
}

// Clear cache
export const clearItemsCache = async () => {
	try {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		await db.items.clear()
		await db.item_prices.clear()
		await setSetting("items_last_sync", null)
		console.log("Items cache cleared")
		return true
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error clearing items cache:", error)
		return false
	}
//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
}

export const clearCustomersCache = async () => {
	try {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		await db.customers.clear()
		await setSetting("customers_last_sync", null)
		console.log("Customers cache cleared")
		return true
	} catch (error) {
		//// Neoffice — Biome reformat only (458d81a9); see the block header at the top of this file.
		console.error("Error clearing customers cache:", error)
		return false
	}
}
//// Neoffice — end of the whole-file formatting-only region ▲▲▲

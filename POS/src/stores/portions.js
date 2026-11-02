//// Neoffice — added file (no upstream equivalent). The portions the kitchen made of the products of the till's cards (NeoResto lot 1,
//// Daniel, 02.11.2026). A local copy of what the server says, as the stock store is one for the stock: the server counts, this
//// store holds what it was told, and the screens subtract the cart.
import { defineStore } from "pinia"
import { ref } from "vue"
import { call } from "@/utils/apiWrapper"
import { logger } from "@/utils/logger"
import { leftToSell } from "@/utils/portions"

const log = logger.create("Portions")

export const usePortionsStore = defineStore("portions", () => {
	// item code -> { made, sold, left }, the counted products only
	const entries = ref({})

	const entryOf = (code) => entries.value[code] || null

	/** What may still be sold of a product, the cart's quantity taken off: a number, or null when nothing limits it. */
	const leftOf = (code, inCart = 0) => leftToSell(entryOf(code), inCart)

	const isCounted = (code) => !!entryOf(code)

	function take(codes, answer) {
		const next = { ...entries.value }
		for (const code of codes) {
			if (answer && answer[code]) next[code] = answer[code]
			else delete next[code]
		}
		entries.value = next
	}

	/** Read the portions of some products again; `excludeInvoice` is the order on the till's screen, whose lines the cart accounts for. */
	async function refresh(codes, excludeInvoice = null) {
		const wanted = [...new Set((codes || []).filter(Boolean))]
		if (!wanted.length) return
		try {
			const response = await call("pos_next.api.portions.get_portions", {
				item_codes: JSON.stringify(wanted),
				exclude_invoice: excludeInvoice || undefined,
			})
			take(wanted, response?.message || response || {})
		} catch (error) {
			log.error("Refresh failed", error)
		}
	}

	/** The kitchen can make `quantity` more portions of a product. Rejects when the server refuses. */
	async function add(code, quantity) {
		const response = await call("pos_next.api.portions.add_portions", { item: code, quantity })
		take([code], { [code]: response?.message || response })
	}

	return { entries, entryOf, leftOf, isCounted, refresh, add, take }
})

//// Neoffice — added file (no upstream equivalent)
//
// Keep a permanently-open till on the current build, without ever reloading at
// a moment that could cost a sale.
//
// Why this exists
// ---------------
// The till is a Chrome tab the shop opens in the morning and never touches
// again. At guigoz it ran from 14 to 18 August without a single reload, straight
// through three `bench restart`s. Nothing brought it up to date: `autoUpdate`
// only looks for a new service worker on navigation (plus the browser's own
// ~24 h check), and a till never navigates. A fix can therefore sit deployed on
// the server for days while the shop keeps running the broken build — which is
// how the 17 August double charge happened under a fix that had already shipped.
//
// The two failure modes to avoid
// ------------------------------
// 1. Never checking   → the shop runs stale code indefinitely (what happened).
// 2. Reloading eagerly → `autoUpdate` reloads the instant the new worker
//    activates. Mid-sale that drops the cart; mid-payment it is far worse.
//
// So: check often, apply only at rest.

import { getOfflineInvoiceCount, isOffline } from "./offline/sync"
import { logger } from "./logger"
import { usePOSCartStore } from "../stores/posCart"

const log = logger.create("TillAutoUpdate")

// How often to ask the server whether a new build exists.
const CHECK_INTERVAL_MS = 15 * 60 * 1000
// How often to re-test "is the till at rest?" once an update is waiting.
const IDLE_POLL_MS = 10 * 1000

/**
 * At rest = reloading right now would cost nothing.
 *
 * - Empty cart is the strong signal: no cart means no sale in progress, and so
 *   no payment in flight either (a payment always belongs to a cart).
 * - No dialog: shift closing, invoice created, customer edit — a reload there
 *   yanks the screen from under the cashier.
 * - Online with an empty offline queue: the IndexedDB queue does survive a
 *   reload, but swapping the build while sales are still waiting to sync means
 *   draining a queue with code that did not write it. Costs nothing to wait.
 */
async function isAtRest() {
	try {
		if (document.querySelector('[role="dialog"], .modal.show')) return false

		const cart = usePOSCartStore()
		if ((cart.invoiceItems?.length ?? 0) > 0) return false

		if (isOffline()) return false
		if ((await getOfflineInvoiceCount()) > 0) return false

		return true
	} catch (err) {
		// Never let a broken read conclude that it is safe.
		log.warn("idle check failed, staying put", err)
		return false
	}
}

export function setupTillAutoUpdate(registerSW) {
	let applyUpdate = null
	let idleTimer = null

	const applyWhenAtRest = () => {
		if (idleTimer) return
		log.info("New build available — will apply as soon as the till is at rest")
		idleTimer = setInterval(async () => {
			if (!(await isAtRest())) return
			clearInterval(idleTimer)
			idleTimer = null
			log.info("Till at rest — applying the update now")
			applyUpdate?.(true)
		}, IDLE_POLL_MS)
	}

	applyUpdate = registerSW({
		immediate: true,
		onNeedRefresh: applyWhenAtRest,
		onOfflineReady: () => log.info("App ready to work offline"),
		onRegistered: (reg) => {
			log.info("Service Worker registered", reg)
			if (!reg) return
			// A tab that never navigates is a tab the browser never re-checks.
			// Ask explicitly, for as long as the till stays open.
			setInterval(() => {
				reg.update().catch((err) => log.warn("update check failed", err))
			}, CHECK_INTERVAL_MS)
		},
		onRegisterError: (err) => log.error("Service Worker registration error", err),
	})
}

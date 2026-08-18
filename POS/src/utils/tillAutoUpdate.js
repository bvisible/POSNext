//// Neoffice — added file (no upstream equivalent)
//
// Keep a permanently-open till on the current build, without ever reloading at
// a moment that could cost a sale.
//
// Why this exists
// ---------------
// The till is a Chrome tab the shop opens in the morning and never touches
// again. At guigoz it ran from 14 to 18 August without a single reload, straight
// through three `bench restart`s. A fix can therefore sit deployed on the server
// for days while the shop keeps running the broken build — which is exactly how
// the 17 August double charge happened, under a fix that had already shipped.
//
// Why NOT the service worker
// --------------------------
// The obvious mechanism — `registerSW`'s `onNeedRefresh` — cannot work here, and
// silently so. The worker's scope is `/assets/pos_next/pos/` (set by the PWA
// manifest) while the till is served at `/pos`. The page is therefore never
// controlled by the worker (`navigator.serviceWorker.controller === null`,
// verified on osiris 2026-08-18), so no update event ever reaches it. Wiring the
// update to it would have looked right and done nothing.
//
// So we compare build stamps instead: `__BUILD_VERSION__` is baked into this
// bundle at build time, and the same value is written to `version.json` next to
// the assets. Different values = a newer build is deployed. No worker involved.
//
// When to apply it
// ----------------
// Never mid-sale. An empty cart is the strong signal: no cart means no sale in
// progress and so no payment in flight either. A till reaches that state after
// every single sale, so an update lands within minutes and nobody notices.

import { getOfflineInvoiceCount, isOffline } from "./offline/sync"
import { logger } from "./logger"
import { usePOSCartStore } from "../stores/posCart"

const log = logger.create("TillAutoUpdate")

const VERSION_URL = "/assets/pos_next/pos/version.json"
// Remembers the build we already reloaded for. Without it, a `version.json`
// that advertises a build the server is not actually serving — a partial or
// half-rolled-back deploy — makes the till reload every ten seconds, forever.
// Observed on osiris while testing this very file. sessionStorage is the right
// scope: it dies with the tab, so a genuine later update is never suppressed.
const RELOADED_FOR_KEY = "neopos_reloaded_for_build"
// How often to ask the server whether a newer build is deployed.
const CHECK_INTERVAL_MS = 15 * 60 * 1000
// Once a new build is known, how often to re-test "is the till at rest?".
const IDLE_POLL_MS = 10 * 1000

async function fetchDeployedVersion() {
	// `cache: no-store` matters: this file is small, and a cached copy would
	// make the till believe it is up to date forever.
	const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" })
	if (!res.ok) throw new Error(`version.json → HTTP ${res.status}`)
	const body = await res.json()
	return String(body?.version || "")
}

/**
 * At rest = reloading right now would cost nothing.
 *
 * - Empty cart: no sale in progress, therefore no payment in flight either.
 * - No dialog: shift closing, invoice created, customer edit — reloading there
 *   yanks the screen from under the cashier.
 * - Online with an empty offline queue: the IndexedDB queue does survive a
 *   reload, but draining a queue written by the old build with the new one is
 *   a risk worth nothing to take.
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
		// Never let a failed read conclude that it is safe.
		log.warn("idle check failed, staying put", err)
		return false
	}
}

export function setupTillAutoUpdate() {
	const running = typeof __BUILD_VERSION__ !== "undefined" ? String(__BUILD_VERSION__) : ""
	if (!running) {
		log.warn("no build stamp in this bundle — auto-update disabled")
		return
	}

	let idleTimer = null

	const applyWhenAtRest = (deployed) => {
		if (idleTimer) return
		// Already reloaded once for this build and still running the old one?
		// Reloading again will not help — the server is not serving what its
		// version.json claims. Say so once and stop, rather than looping.
		try {
			if (sessionStorage.getItem(RELOADED_FOR_KEY) === deployed) {
				log.error(
					`Reloaded for build ${deployed} but still running ${running} — ` +
						"the served assets do not match version.json. Not reloading again.",
				)
				return
			}
		} catch {
			// sessionStorage unavailable (private mode): fall through, one reload
			// is still better than staying stale.
		}
		log.info(`New build deployed (${running} → ${deployed}) — waiting for the till to be at rest`)
		idleTimer = setInterval(async () => {
			if (!(await isAtRest())) return
			clearInterval(idleTimer)
			idleTimer = null
			log.info("Till at rest — reloading onto the new build")
			try {
				sessionStorage.setItem(RELOADED_FOR_KEY, deployed)
			} catch {
				/* best effort */
			}
			window.location.reload()
		}, IDLE_POLL_MS)
	}

	const check = async () => {
		try {
			const deployed = await fetchDeployedVersion()
			if (deployed && deployed !== running) applyWhenAtRest(deployed)
		} catch (err) {
			// Offline or server down: not our problem, try again next time.
			log.debug("version check failed", err)
		}
	}

	setInterval(check, CHECK_INTERVAL_MS)
	// One check shortly after boot, so a till reopened right after a deploy
	// does not wait a quarter of an hour.
	setTimeout(check, 30 * 1000)
}

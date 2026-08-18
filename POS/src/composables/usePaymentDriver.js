// Copyright (c) 2026, Neoffice and contributors
// License: AGPL-3.0
//
// usePaymentDriver — PSP-agnostic composable bridging POSNext to the unified
// `payments` app. Reactive intent state + SocketIO subscription + Frappe API
// calls in one place. Callers never need to know the PSP brand (Stripe vs
// TWINT etc.); they react to `intent.value.status` / `intent.value.next_action_type`.
//
// Typical flow in a Vue component:
//
//   const { intent, isInFlight, start, cancel } = usePaymentDriver()
//   await start({
//     referenceDoctype: "POS Invoice",
//     referenceName: invoice.name,
//     posProfile, modeOfPayment, amount: 1500, currency: "CHF",
//   })
//   // pick the dialog component from intent.value.next_action_type
//
// The composable cleans up its SocketIO subscription on unmount.

import { computed, onBeforeUnmount, ref } from "vue"
import { call } from "frappe-ui"

//// Neoffice — added file (no upstream equivalent)
//
// A status ends the watch only once the money has actually settled one way or
// another. `failed` is deliberately NOT in this set: Stripe Terminal emits
// `payment_intent.payment_failed` on a *soft* decline (wrong PIN,
// `online_or_offline_pin_required`) and then replays on the SAME PaymentIntent
// when the customer re-enters the code — a `succeeded` lands 15-30 s later.
// Treating `failed` as final made the till stop listening at the decline: the
// card was charged with no sale recorded, the cashier re-ran the card, and the
// customer paid twice (guigoz: 20.07 3x48.-, 22.07 2x52.-, 17.08 2x48.-).
// The backend FSM was fixed for exactly this in `payments` (717f41d, db5d557);
// this is its missing frontend counterpart. `canceled` stays final — it is only
// reached when the till explicitly cancels the intent.
const SETTLED_STATUSES = new Set(["succeeded", "canceled", "refunded"])

// Fallback polling cadence. The till finalizes a payment on the realtime
// `payment.intent.*.updated` event, but realtime is a single point of failure
// (e.g. SocketIO is dropped when the server restarts and an already-open till
// never reconnects). Polling the status as a safety net guarantees the till
// still validates even if no realtime event ever arrives.
const POLL_INTERVAL_MS = 2500
const POLL_MAX_MS = 240_000

export function usePaymentDriver() {
	const intent = ref(null)
	const isInFlight = ref(false)
	const lastError = ref(null)
	let realtimeOff = null
	let pollTimer = null
	let pollDeadline = 0

	function _startPolling(intentName) {
		// Safety net for a missed/late realtime event: reconcile the intent
		// status every few seconds until it is final. Harmless when realtime
		// works — refreshStatus is idempotent and stops the poll once final.
		if (pollTimer || !intentName) return
		pollDeadline = Date.now() + POLL_MAX_MS
		pollTimer = setInterval(() => {
			if (Date.now() > pollDeadline) {
				_stopPolling()
				return
			}
			refreshStatus(intentName)
		}, POLL_INTERVAL_MS)
	}

	function _stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer)
			pollTimer = null
		}
	}

	function _attachRealtime(intentName) {
		_detachRealtime()
		const event = `payment.intent.${intentName}.updated`
		const handler = (data) => {
			if (!data || data.intent_name !== intentName) return
			// Refresh the intent dict from the server to get the full normalized payload.
			refreshStatus(intentName)
		}
		if (window.frappe?.realtime?.on) {
			window.frappe.realtime.on(event, handler)
			realtimeOff = () => window.frappe.realtime.off(event, handler)
		}
	}

	function _detachRealtime() {
		if (realtimeOff) {
			try {
				realtimeOff()
			} catch (e) {
				// silent — Frappe realtime may already be torn down
			}
			realtimeOff = null
		}
	}

	async function _call(method, args) {
		// POSNext is a standalone Vue SPA — the classic desk helper
		// `window.frappe.call` is not available here. Use frappe-ui's `call`,
		// which posts to /api/method/<method> and returns the unwrapped
		// `message` payload directly.
		return await call(method, args)
	}

	async function start({
		referenceDoctype,
		referenceName,
		posProfile,
		modeOfPayment,
		amount,
		currency,
		device = null,
		metadata = null,
	}) {
		lastError.value = null
		isInFlight.value = true
		try {
			const result = await _call("pos_next.api.payments.pos_start_payment", {
				reference_doctype: referenceDoctype,
				reference_name: referenceName,
				pos_profile: posProfile,
				mode_of_payment: modeOfPayment,
				amount,
				currency,
				device,
				metadata: metadata ? JSON.stringify(metadata) : null,
			})
			intent.value = result
			if (result?.intent_name) {
				_attachRealtime(result.intent_name)
			}
			if (SETTLED_STATUSES.has(result?.status)) {
				isInFlight.value = false
			} else {
				// `failed` included: the reader may still be waiting on the
				// customer, so drop the spinner but keep watching.
				if (result?.status === "failed") isInFlight.value = false
				if (result?.intent_name) {
					// Not settled yet — poll as a safety net alongside realtime.
					_startPolling(result.intent_name)
				}
			}
			return result
		} catch (err) {
			lastError.value = err
			isInFlight.value = false
			throw err
		}
	}

	async function refreshStatus(intentName) {
		const name = intentName || intent.value?.intent_name
		if (!name) return null
		try {
			const fresh = await _call("pos_next.api.payments.pos_get_intent_status", {
				intent_name: name,
			})
			intent.value = fresh
			const settled = SETTLED_STATUSES.has(fresh?.status)
			// A soft decline clears the spinner (the dialog shows the error) but
			// must NOT end the watch — the PSP can still settle this same intent.
			if (settled || fresh?.status === "failed") {
				isInFlight.value = false
			}
			if (settled) {
				_detachRealtime()
				_stopPolling()
			}
			return fresh
		} catch (err) {
			lastError.value = err
			return null
		}
	}

	async function cancel() {
		const name = intent.value?.intent_name
		if (!name) return null
		try {
			const result = await _call("pos_next.api.payments.pos_cancel_payment", {
				intent_name: name,
			})
			intent.value = result
			isInFlight.value = false
			_detachRealtime()
			_stopPolling()
			return result
		} catch (err) {
			lastError.value = err
			throw err
		}
	}

	async function refund({ intentName, amount = null }) {
		// Refunds are typically driven from a different screen than the live POS sale;
		// expose the call here for completeness.
		const target = intentName || intent.value?.intent_name
		if (!target) throw new Error("No intent_name to refund")
		const result = await _call("pos_next.api.payments.pos_refund_payment", {
			intent_name: target,
			amount,
		})
		return result
	}

	async function attachDevice(device) {
		const name = intent.value?.intent_name
		if (!name) throw new Error("No active intent")
		const result = await _call("pos_next.api.payments.pos_attach_device", {
			intent_name: name,
			device,
		})
		intent.value = result
		return result
	}

	function reset() {
		_detachRealtime()
		_stopPolling()
		intent.value = null
		isInFlight.value = false
		lastError.value = null
	}

	onBeforeUnmount(() => {
		_detachRealtime()
		_stopPolling()
	})

	// Convenient computed refs the UI can bind to without optional-chaining everywhere.
	const status = computed(() => intent.value?.status ?? null)
	const nextActionType = computed(() => intent.value?.next_action_type ?? null)
	const nextActionPayload = computed(() => intent.value?.next_action_payload ?? null)
	// "the intent will not change any more" — a `failed` intent still can.
	const isTerminal = computed(() => SETTLED_STATUSES.has(status.value))

	return {
		// state
		intent,
		isInFlight,
		isTerminal,
		lastError,
		status,
		nextActionType,
		nextActionPayload,
		// actions
		start,
		refreshStatus,
		cancel,
		refund,
		attachDevice,
		reset,
	}
}

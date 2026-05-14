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

const FINAL_STATUSES = new Set(["succeeded", "failed", "canceled", "refunded"])

export function usePaymentDriver() {
	const intent = ref(null)
	const isInFlight = ref(false)
	const lastError = ref(null)
	let realtimeOff = null

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
			if (FINAL_STATUSES.has(result?.status)) {
				isInFlight.value = false
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
			if (FINAL_STATUSES.has(fresh?.status)) {
				isInFlight.value = false
				_detachRealtime()
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
		intent.value = null
		isInFlight.value = false
		lastError.value = null
	}

	onBeforeUnmount(() => {
		_detachRealtime()
	})

	// Convenient computed refs the UI can bind to without optional-chaining everywhere.
	const status = computed(() => intent.value?.status ?? null)
	const nextActionType = computed(() => intent.value?.next_action_type ?? null)
	const nextActionPayload = computed(() => intent.value?.next_action_payload ?? null)
	const isTerminal = computed(() => FINAL_STATUSES.has(status.value))

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

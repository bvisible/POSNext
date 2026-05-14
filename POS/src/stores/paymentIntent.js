// Copyright (c) 2026, Neoffice and contributors
// License: AGPL-3.0
//
// Pinia store wrapping the unified payments flow for cross-component access.
// Most components should prefer the local `usePaymentDriver()` composable
// (component-scoped). This store is for global features: the customer-facing
// display, KDS, restaurant table monitor, etc.

import { defineStore } from "pinia"
import { ref, computed } from "vue"
import { call } from "frappe-ui"

const FINAL_STATUSES = new Set(["succeeded", "failed", "canceled", "refunded"])

export const usePaymentIntentStore = defineStore("paymentIntent", () => {
	// Currently displayed intent, if any. Keyed by intent_name.
	const activeIntent = ref(null)
	const knownIntents = ref({})       // intent_name → serialized payload
	const subscriptions = new Map()    // intent_name → off function

	function _attach(intentName) {
		if (subscriptions.has(intentName) || !window.frappe?.realtime?.on) return
		const event = `payment.intent.${intentName}.updated`
		const handler = (data) => {
			if (!data || data.intent_name !== intentName) return
			refresh(intentName)
		}
		window.frappe.realtime.on(event, handler)
		subscriptions.set(intentName, () => window.frappe.realtime.off(event, handler))
	}

	function _detach(intentName) {
		const off = subscriptions.get(intentName)
		if (off) {
			try { off() } catch (e) {}
			subscriptions.delete(intentName)
		}
	}

	async function _call(method, args) {
		// POSNext is a standalone Vue SPA — the classic desk helper
		// `window.frappe.call` is not available here. Use frappe-ui's `call`,
		// which posts to /api/method/<method> and returns the unwrapped
		// `message` payload directly.
		return await call(method, args)
	}

	function track(intentPayload) {
		if (!intentPayload?.intent_name) return
		knownIntents.value[intentPayload.intent_name] = intentPayload
		activeIntent.value = intentPayload
		_attach(intentPayload.intent_name)
	}

	async function refresh(intentName) {
		const name = intentName || activeIntent.value?.intent_name
		if (!name) return null
		const fresh = await _call("pos_next.api.payments.pos_get_intent_status", { intent_name: name })
		knownIntents.value[name] = fresh
		if (activeIntent.value?.intent_name === name) {
			activeIntent.value = fresh
		}
		if (FINAL_STATUSES.has(fresh?.status)) {
			_detach(name)
		}
		return fresh
	}

	function clear() {
		const name = activeIntent.value?.intent_name
		if (name) _detach(name)
		activeIntent.value = null
	}

	function clearAll() {
		for (const name of [...subscriptions.keys()]) _detach(name)
		knownIntents.value = {}
		activeIntent.value = null
	}

	const status = computed(() => activeIntent.value?.status ?? null)
	const isFinal = computed(() => FINAL_STATUSES.has(status.value))

	return {
		activeIntent,
		knownIntents,
		status,
		isFinal,
		track,
		refresh,
		clear,
		clearAll,
	}
})

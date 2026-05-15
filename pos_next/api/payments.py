# Copyright (c) 2026, Neoffice and contributors
# License: AGPL-3.0
"""POSNext payments façade — thin layer over ``payments.api.intent.*``.

This module is the **only** place where POSNext talks to the unified payments
app. It resolves the POS Payment Driver Mapping (POS Profile × Mode of Payment
→ Payment Provider × Payment Channel × Payment Device) and forwards to the
underlying driver.

The legacy ``wallee_integration`` import has been removed from
``pos_next.api.guest_ordering`` in favour of this dispatcher. See ADR-001.
"""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _


def _resolve_mapping(pos_profile: str, mode_of_payment: str) -> dict[str, Any]:
	"""Return the mapping dict for the given (pos_profile, mode_of_payment).

	Throws ``frappe.DoesNotExistError`` if no enabled mapping exists.
	"""
	mapping_name = frappe.db.get_value(
		"POS Payment Driver Mapping",
		{
			"pos_profile": pos_profile,
			"mode_of_payment": mode_of_payment,
			"enabled": 1,
		},
		"name",
	)
	if not mapping_name:
		frappe.throw(
			_(
				"No enabled POS Payment Driver Mapping found for POS Profile {0} × "
				"Mode of Payment {1}. Create one to route payments via the unified "
				"driver layer."
			).format(pos_profile, mode_of_payment),
			frappe.DoesNotExistError,
		)
	doc = frappe.get_doc("POS Payment Driver Mapping", mapping_name)
	return {
		"mapping_name": doc.name,
		"provider": doc.provider,
		"channel": doc.channel,
		"default_device": doc.default_device,
		"auto_attach_device": bool(doc.auto_attach_device),
		"options": doc.get_options(),
	}


@frappe.whitelist()
def pos_get_mapping(pos_profile: str, mode_of_payment: str) -> dict[str, Any]:
	"""Return the driver mapping a POS UI can use to decide what to render."""
	return _resolve_mapping(pos_profile, mode_of_payment)


@frappe.whitelist()
def pos_start_payment(
	reference_doctype: str,
	reference_name: str,
	pos_profile: str,
	mode_of_payment: str,
	amount: int,
	currency: str,
	device: str | None = None,
	metadata: dict[str, Any] | str | None = None,
) -> dict[str, Any]:
	"""Create a Payment Intent + (optionally) attach to a reader.

	- ``amount`` is in the smallest currency unit (rappen / cents).
	- ``device`` overrides the mapping's ``default_device``. If neither is set
	  and channel=terminal, the intent is created but **not** attached; the POS
	  UI is expected to call :func:`pos_attach_device` later (e.g. when the
	  cashier picks a reader from a list).
	- ``metadata`` is merged with the mapping's ``options_json`` and the POS
	  context (pos_profile, mode_of_payment, reference_*).
	"""
	from payments.api import intent as intent_api

	mapping = _resolve_mapping(pos_profile, mode_of_payment)

	if isinstance(metadata, str):
		try:
			metadata_dict = json.loads(metadata) if metadata else {}
		except (ValueError, TypeError):
			metadata_dict = {}
	else:
		metadata_dict = metadata or {}
	# Compose metadata: mapping options first (defaults), then caller, then POS context.
	composed = dict(mapping["options"])
	composed.update(metadata_dict)
	composed.setdefault("pos_profile", pos_profile)
	composed.setdefault("mode_of_payment", mode_of_payment)
	composed.setdefault("channel_via", mapping["channel"])

	# Pick the device. Mapping default first, override last.
	picked_device = device or mapping["default_device"]

	result = intent_api.create_intent(
		provider=mapping["provider"],
		channel=mapping["channel"],
		amount=int(amount),
		currency=currency,
		reference_doctype=reference_doctype,
		reference_name=reference_name,
		device=picked_device,
		metadata=composed,
	)

	# Auto-attach to reader when configured (only meaningful for terminal channel).
	if (
		mapping["auto_attach_device"]
		and mapping["channel"] == "terminal"
		and picked_device
		and result.get("status") == "requires_action"
	):
		from payments.api import terminal as terminal_api

		try:
			result = terminal_api.attach_intent_to_reader(result["intent_name"], picked_device)
		except Exception as exc:  # noqa: BLE001 — surface but don't tank create
			frappe.log_error(
				"pos_start_payment auto-attach failed",
				f"intent={result.get('intent_name')} device={picked_device}: {exc!r}",
			)
			# Result remains the requires_action one; caller can retry attach manually.

	return result


@frappe.whitelist()
def pos_attach_device(intent_name: str, device: str) -> dict[str, Any]:
	"""Attach an existing Payment Intent to a Payment Device.

	Used when the cashier picks a reader after the intent has been created
	(e.g. for ad-hoc / mobile terminals).
	"""
	from payments.api import terminal as terminal_api

	return terminal_api.attach_intent_to_reader(intent_name, device)


@frappe.whitelist()
def pos_get_intent_status(intent_name: str) -> dict[str, Any]:
	"""Proxy of :func:`payments.api.intent.get_intent_status`."""
	from payments.api import intent as intent_api

	return intent_api.get_intent_status(intent_name)


@frappe.whitelist()
def pos_cancel_payment(intent_name: str) -> dict[str, Any]:
	"""Cancel an in-flight Payment Intent. No-op on terminal-state intents."""
	from payments.api import intent as intent_api

	return intent_api.cancel_intent(intent_name)


@frappe.whitelist()
def pos_refund_payment(intent_name: str, amount: int | None = None) -> dict[str, Any]:
	"""Refund a settled Payment Intent (partial or full)."""
	from payments.api import intent as intent_api

	return intent_api.refund_intent(intent_name, amount=amount)


@frappe.whitelist()
def pos_get_active_devices(
	pos_profile: str,
	provider: str | None = None,
	channel: str | None = None,
) -> list[dict[str, Any]]:
	"""Return the Payment Devices a cashier may pick from on this POS Profile.

	The intersection rule:
	  1. Device is listed in ``POS Profile.custom_active_payment_devices`` (the
	     admin explicitly enabled it on this profile).
	  2. ``Payment Device.enabled == 1``.
	  3. If ``provider``/``channel`` are given, the device's
	     ``provider_channel_settings`` matches both.

	The mapping's ``default_device`` is flagged with ``is_default=True`` so the
	frontend can pre-select it. When only a single candidate device matches,
	the UI is expected to hide the selector entirely.
	"""
	# 1. Read the active devices declared on the POS Profile.
	try:
		profile_doc = frappe.get_doc("POS Profile", pos_profile)
	except frappe.DoesNotExistError:
		frappe.throw(_("POS Profile {0} not found").format(pos_profile))

	declared = [
		row.payment_device
		for row in (profile_doc.get("custom_active_payment_devices") or [])
		if row.payment_device
	]
	if not declared:
		return []

	# 2. Optional default_device from the mapping (for the same profile + channel).
	default_device = None
	if provider and channel:
		default_device = frappe.db.get_value(
			"POS Payment Driver Mapping",
			{
				"pos_profile": pos_profile,
				"provider": provider,
				"channel": channel,
				"enabled": 1,
			},
			"default_device",
		)

	# 3. Fetch device rows, filtered by enabled + provider/channel binding.
	filters: dict[str, Any] = {"name": ["in", declared], "enabled": 1}
	if provider and channel:
		# Resolve the Provider Channel Settings name (one per (provider, channel) pair).
		pcs_name = frappe.db.get_value(
			"Provider Channel Settings",
			{"provider": provider, "channel": channel},
			"name",
		)
		if not pcs_name:
			return []
		filters["provider_channel_settings"] = pcs_name

	rows = frappe.get_all(
		"Payment Device",
		filters=filters,
		fields=[
			"name",
			"device_label",
			"provider_device_id",
			"device_type",
			"status",
			"location_ref",
		],
		order_by="device_label asc",
	)

	# 4. Look up provider mode once (used to expose is_test_mode).
	#    Drives the "Simulator controls" UI in CardPresentDialog — those
	#    Accept/Decline buttons should only render in test mode against a
	#    simulated device.
	provider_mode = None
	if provider:
		provider_mode = frappe.db.get_value("Payment Provider", provider, "mode")

	for row in rows:
		row["is_default"] = row["name"] == default_device
		# Stripe's simulated reader has device_type == "simulated_wisepos_e".
		# Other future simulators are expected to follow the same prefix.
		dev_type = (row.get("device_type") or "").lower()
		row["is_simulator"] = dev_type.startswith("simulated")
		row["is_test_mode"] = provider_mode == "test"

	return rows


@frappe.whitelist()
def pos_simulate_terminal_outcome(
	intent_name: str,
	outcome: str = "succeeded",
) -> dict[str, Any]:
	"""Test-mode helper: drive a Stripe simulated reader from the POS UI.

	Replicates what the webhook worker would do on `terminal.reader.action_*`
	events because most dev/test instances (including Osiris) don't have a
	`webhook_secret` configured nor a Stripe Dashboard endpoint pointing at
	them. The Simulator panel in CardPresentDialog calls this so a cashier
	can validate the full flow end-to-end during development.

	Outcome:
	  - ``succeeded``: present_payment_method → capture_payment → FSM to
	    ``succeeded`` → publish SocketIO. Customer-facing result: the dialog
	    flips to "Payment successful" and a locked Payment Entry is pushed.
	  - ``declined``:  cancel the Stripe PaymentIntent → FSM to ``failed``
	    with synthetic ``card_declined`` → publish SocketIO. The dialog
	    flips to "Payment failed: Card declined by issuer (simulated)".

	Guards (refuse on a production-shaped setup so this can never leak):
	  - Intent must be in ``processing`` or ``requires_action``
	  - Intent's provider.mode must be ``test``
	  - Intent's device.device_type must start with ``simulated``
	"""
	intent_doc = frappe.get_doc("Payment Intent", intent_name)

	if intent_doc.status not in ("processing", "requires_action"):
		frappe.throw(
			_(
				"Intent {0} is in status {1}, not eligible for simulation"
			).format(intent_name, intent_doc.status)
		)

	# Provider must be in test mode.
	provider_mode = frappe.db.get_value("Payment Provider", intent_doc.provider, "mode")
	if provider_mode != "test":
		frappe.throw(_("Simulator controls are only available in test mode"))

	# Device must be a simulator.
	if not intent_doc.device:
		frappe.throw(_("Intent has no device attached"))
	device_doc = frappe.get_doc("Payment Device", intent_doc.device)
	device_type = (device_doc.device_type or "").lower()
	if not device_type.startswith("simulated"):
		frappe.throw(
			_(
				"Device {0} is not a simulator (device_type={1})"
			).format(device_doc.name, device_doc.device_type or "<none>")
		)

	# Resolve the driver so we get the right Stripe API key + capture helper.
	from payments.drivers.registry import resolve_driver

	driver = resolve_driver(intent_doc.provider, intent_doc.channel)

	if outcome == "succeeded":
		# 1. Trigger the simulated card presentation on the Stripe reader.
		#    This is what `present_payment_method` does in real life — the
		#    customer taps their card. The simulator runs through it instantly.
		import stripe

		try:
			stripe.terminal.Reader.TestHelpers.present_payment_method(
				device_doc.provider_device_id,
				api_key=driver._api_key,
			)
		except Exception as exc:  # noqa: BLE001
			# Already-presented or already-captured states throw; don't tank
			# the simulation — try to push through to capture/transition anyway.
			frappe.log_error(
				"Simulator present_payment_method failed",
				f"intent={intent_name} pi={intent_doc.provider_intent_id}: {exc!r}",
			)

		# 2. Capture the PaymentIntent — what the webhook worker would do on
		#    `terminal.reader.action_succeeded`.
		try:
			driver.capture_payment(intent_doc.provider_intent_id)
		except Exception as exc:  # noqa: BLE001
			frappe.log_error(
				"Simulator capture_payment failed",
				f"intent={intent_name} pi={intent_doc.provider_intent_id}: {exc!r}",
			)

		# 3. Replicate process_event's FSM transition + SocketIO publish.
		intent_doc.transition_to(
			"succeeded",
			event_source="webhook",
			payload_excerpt=(
				f"payment_intent.succeeded pi={intent_doc.provider_intent_id} "
				f"status=succeeded (simulated)"
			),
			ignore_invalid=True,
		)
		intent_doc.reload()
		frappe.db.commit()
		frappe.publish_realtime(
			event=f"payment.intent.{intent_doc.name}.updated",
			message={
				"intent_name": intent_doc.name,
				"status": intent_doc.status,
				"event_type": "payment_intent.succeeded",
			},
			after_commit=False,
		)

	elif outcome == "declined":
		# 1. Cancel the PaymentIntent on Stripe so we don't leave a dangling
		#    auth on the customer's card.
		try:
			driver.cancel_intent(intent_doc.provider_intent_id)
		except Exception as exc:  # noqa: BLE001
			frappe.log_error(
				"Simulator cancel_intent failed",
				f"intent={intent_name} pi={intent_doc.provider_intent_id}: {exc!r}",
			)

		# 2. Transition Frappe FSM to failed with a synthetic decline message.
		intent_doc.transition_to(
			"failed",
			event_source="webhook",
			error_code="card_declined",
			error_message="Card declined by issuer (simulated)",
			payload_excerpt=(
				f"payment_intent.payment_failed pi={intent_doc.provider_intent_id} "
				f"(simulated decline)"
			),
			ignore_invalid=True,
		)
		intent_doc.reload()
		frappe.db.commit()
		frappe.publish_realtime(
			event=f"payment.intent.{intent_doc.name}.updated",
			message={
				"intent_name": intent_doc.name,
				"status": intent_doc.status,
				"event_type": "payment_intent.payment_failed",
			},
			after_commit=False,
		)

	else:
		frappe.throw(
			_("Unknown simulator outcome: {0} (expected 'succeeded' or 'declined')").format(outcome)
		)

	return {
		"intent_name": intent_doc.name,
		"status": intent_doc.status,
		"outcome": outcome,
	}

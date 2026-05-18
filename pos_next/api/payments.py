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
	# Pull provider.mode so the frontend can decide whether to render
	# debug/test-only UI (e.g. the QRPaymentDialog simulator panel for TWINT,
	# which has no physical device to key off).
	provider_mode = frappe.db.get_value("Payment Provider", doc.provider, "mode")
	return {
		"mapping_name": doc.name,
		"provider": doc.provider,
		"provider_mode": provider_mode,
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

	# Pick the device. Mapping default first, override last. Virtual device
	# names (emitted by pos_get_active_devices for QR-only channels with no
	# physical terminal — e.g. TWINT QR) are normalized to None so we don't
	# try to attach an intent to a Payment Device that doesn't exist.
	picked_device = device or mapping["default_device"]
	if picked_device and str(picked_device).startswith("virtual:"):
		picked_device = None

	# Resolve (provider, channel). When the cashier explicitly picked a device
	# at runtime (multiple-endpoints picker), DERIVE (provider, channel) from
	# the device's Provider Channel Settings rather than from the mapping —
	# otherwise a Wallee terminal pick on a Stripe-default mapping would create
	# a Stripe intent attached to a Wallee device.
	# The mapping then only contributes its `default_device` (if device was
	# omitted) and `options_json` defaults.
	picked_provider = mapping["provider"]
	picked_channel = mapping["channel"]
	if picked_device:
		pcs = frappe.db.get_value(
			"Payment Device",
			picked_device,
			"provider_channel_settings",
		)
		if pcs:
			pcs_provider, pcs_channel = frappe.db.get_value(
				"Provider Channel Settings", pcs, ["provider", "channel"]
			) or (None, None)
			if pcs_provider and pcs_channel:
				picked_provider = pcs_provider
				picked_channel = pcs_channel
				# Keep `composed.channel_via` accurate for downstream logs.
				composed["channel_via"] = pcs_channel

	result = intent_api.create_intent(
		provider=picked_provider,
		channel=picked_channel,
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
		and picked_channel == "terminal"
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
	mode_of_payment: str | None = None,
	provider: str | None = None,
	channel: str | None = None,
) -> list[dict[str, Any]]:
	"""Return the (Mode of Payment, Payment Device) rows a cashier may pick from
	on this POS Profile for the given Mode of Payment.

	Filtering pipeline:
	  1. Rows declared in ``POS Profile.custom_active_payment_devices`` (the
	     admin explicitly enabled them on this profile).
	  2. Rows whose ``mode_of_payment`` matches the requested one (when given).
	  3. For rows with a ``payment_device`` (physical terminal): the device must
	     be ``Payment Device.enabled == 1`` and bound to the requested
	     provider/channel.
	  4. For rows WITHOUT a ``payment_device`` (TWINT QR / future bank QRs): we
	     return a virtual row so the cashier UI has something to select. This is
	     only emitted when ``channel`` is a non-terminal channel.

	Each returned row carries:
	  - ``name``           : device name OR ``virtual:<idx>`` for non-physical
	  - ``device_label``   : human label
	  - ``device_type``    : raw device_type (or ``virtual_qr`` for non-physical)
	  - ``status``         : Payment Device.status (or ``online`` for virtual)
	  - ``is_default``     : from the child row's ``is_default`` flag
	  - ``is_simulator``   : True for simulated readers (device_type startswith
	    "simulated") or for virtual rows when provider.mode == "test"
	  - ``is_test_mode``   : True when provider.mode == "test"

	When the result has zero rows, the cashier UI shows an explanatory error.
	When the result has one row, the picker is hidden and the row is auto-used.
	When the result has more than one, the picker is shown.
	"""
	# 1. Read the active rows declared on the POS Profile.
	try:
		profile_doc = frappe.get_doc("POS Profile", pos_profile)
	except frappe.DoesNotExistError:
		frappe.throw(_("POS Profile {0} not found").format(pos_profile))

	all_rows = profile_doc.get("custom_active_payment_devices") or []

	# 2. Filter by mode_of_payment when supplied. Legacy rows that pre-date the
	#    `mode_of_payment` column may have it empty — those are NOT matched,
	#    forcing the admin to backfill them. (Cleaner than guessing.)
	mop_rows = [
		row for row in all_rows
		if (not mode_of_payment) or (row.get("mode_of_payment") == mode_of_payment)
	]
	if not mop_rows:
		return []

	# 3. Provider mode (used to flag is_test_mode + drive simulator visibility).
	provider_mode = None
	if provider:
		provider_mode = frappe.db.get_value("Payment Provider", provider, "mode")

	# 4. Resolve Provider Channel Settings (only relevant for physical rows).
	pcs_name = None
	if provider and channel:
		pcs_name = frappe.db.get_value(
			"Provider Channel Settings",
			{"provider": provider, "channel": channel},
			"name",
		)

	# 5. Split into "has physical device" and "no device" buckets and resolve.
	physical_device_names = [row.payment_device for row in mop_rows if row.payment_device]
	virtual_rows = [row for row in mop_rows if not row.payment_device]

	# 5a. Physical: intersect with enabled + provider/channel binding.
	resolved: list[dict[str, Any]] = []
	if physical_device_names:
		device_filters: dict[str, Any] | None = {
			"name": ["in", physical_device_names],
			"enabled": 1,
		}
		if pcs_name:
			device_filters["provider_channel_settings"] = pcs_name
		elif provider and channel:
			# Provider/channel given but no PCS row => nothing valid.
			device_filters = None

		if device_filters is not None:
			devices = frappe.get_all(
				"Payment Device",
				filters=device_filters,
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
			# Re-attach is_default from the matching child row.
			default_by_name = {
				row.payment_device: bool(row.get("is_default"))
				for row in mop_rows if row.payment_device
			}
			for dev in devices:
				dev["is_default"] = default_by_name.get(dev["name"], False)
				dev_type = (dev.get("device_type") or "").lower()
				dev["is_simulator"] = dev_type.startswith("simulated")
				dev["is_test_mode"] = provider_mode == "test"
				resolved.append(dev)

	# 5b. Virtual: only emit when the channel has no physical device concept
	#     (qr_bridge today; later: pay_link, etc.). Skip entirely for terminal
	#     channels — a row with no device on a terminal channel is misconfigured.
	if virtual_rows and channel and channel != "terminal":
		for idx, row in enumerate(virtual_rows):
			resolved.append({
				"name": f"virtual:{row.mode_of_payment}:{idx}",
				"device_label": _("{0} (no device)").format(row.mode_of_payment),
				"provider_device_id": None,
				"device_type": "virtual_qr",
				"status": "online",
				"location_ref": None,
				"is_default": bool(row.get("is_default")) or (idx == 0 and len(virtual_rows) == 1),
				# Virtual rows can't be "simulated readers"; the test-mode
				# simulator panel is gated by is_test_mode alone for QR channels.
				"is_simulator": False,
				"is_test_mode": provider_mode == "test",
			})

	return resolved


@frappe.whitelist()
def pos_simulate_terminal_outcome(
	intent_name: str,
	outcome: str = "succeeded",
) -> dict[str, Any]:
	"""Test-mode helper: drive a Payment Intent's FSM from the POS UI itself.

	Used by the Simulator panel in CardPresentDialog (Stripe Terminal channel)
	and QRPaymentDialog (TWINT qr_bridge channel) so a cashier can validate
	the full success/fail UI flow without needing webhooks reachable nor a
	real customer scan.

	Per channel:
	  - ``terminal``  → must have a simulator device. On "succeeded" the
	    helper additionally drives Stripe's test helpers
	    (``Reader.TestHelpers.present_payment_method`` + capture) so the
	    Stripe-side state stays consistent. On "declined" the Stripe PI is
	    cancelled.
	  - ``qr_bridge`` → no device; we skip provider-specific calls entirely
	    and just drive the Frappe FSM. The TWINT bridge transaction (if any)
	    is left in whatever state it was; the cashier should reconcile it
	    manually or let the polling scheduler resolve it. This is fine for
	    UI validation but NOT for cleaning up real money flows — only ever
	    use the simulator panel in test mode.

	Guards (refuse on a production-shaped setup so this can never leak):
	  - Intent must be in ``processing`` or ``requires_action``
	  - Intent's provider.mode must be ``test``
	  - Intent's channel must be one of ``terminal`` or ``qr_bridge``
	  - For ``terminal``: intent.device must exist and be a simulator
	    (device_type starts with ``simulated``).
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

	channel = (intent_doc.channel or "").lower()
	if channel not in ("terminal", "qr_bridge"):
		frappe.throw(
			_("Simulator does not support channel {0}").format(channel or "<none>")
		)

	# For terminal payments only: device must be a simulator. QR has no device.
	if channel == "terminal":
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
	else:
		device_doc = None  # noqa: F841 — referenced only in the terminal branch below

	# Resolve the driver. For terminal we need it for the Stripe helpers; for
	# qr_bridge we still resolve so the driver is bootstrapped (cheap, and may
	# be used by future TWINT-specific test hooks).
	from payments.drivers.registry import resolve_driver

	driver = resolve_driver(intent_doc.provider, intent_doc.channel)

	if outcome == "succeeded":
		# For Stripe Terminal only: round-trip the Stripe-side state via the
		# official test helpers so the PaymentIntent on Stripe ends up captured.
		# For qr_bridge we just transition the local FSM.
		if channel == "terminal":
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
		# 2. Capture the PaymentIntent — what the webhook worker would do on
		#    `terminal.reader.action_succeeded`. Stripe-only; TWINT/qr_bridge
		#    has no "capture" step.
		if channel == "terminal":
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
		# 1. (Stripe only) Cancel the PaymentIntent on Stripe so we don't leave
		#    a dangling auth on the customer's card. For TWINT, no bridge call —
		#    the user can cancel the TWINT transaction manually if a real
		#    transaction had been registered (which should NOT happen in test
		#    mode, by construction of the guards above).
		if channel == "terminal":
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

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

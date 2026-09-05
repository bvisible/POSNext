# //// Neoffice — added file (no upstream equivalent). The ordered states a dish walks through
# //// between the KDS and the runner screen; each house names its own. validate() enforces the
# //// single-default invariant because _resolve_workflow falls back to the default when neither the
# //// product nor the station names one — two defaults would make the fallback arbitrary (d59036f1,
# //// 2026-03-23 "preparation workflows, runner display, and workflow APIs").
import frappe
from frappe import _
from frappe.model.document import Document


class PreparationWorkflow(Document):
	def validate(self):
		if not self.steps:
			frappe.throw(_("At least one step is required in a workflow."))

		if self.is_default:
			# Ensure only one default workflow exists
			existing = frappe.db.get_value(
				"Preparation Workflow",
				{"is_default": 1, "name": ("!=", self.name)},
				"name"
			)
			if existing:
				frappe.throw(
					_("Workflow {0} is already set as default. Only one default workflow is allowed.").format(existing)
				)

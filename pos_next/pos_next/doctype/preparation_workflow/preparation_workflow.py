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

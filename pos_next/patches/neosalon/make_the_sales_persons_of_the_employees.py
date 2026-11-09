# //// Neoffice — added file (no upstream equivalent). The sales persons of a salon are its employees (NeoSalon, step 1, lot G1.2, product
# //// owner, 09.11.2026): where a till already asks for a sales person, each Active employee who has none gets one.
"""Make the Sales Person of every Active employee, on a site where a till asks for one (`pos_next.sales_staff`).

Nothing is done on a site where no till asks for a sales person (the case of nearly every site today): the next time one does, saving the
till's settings makes them. Runs after the doctype sync, which is what makes the columns it reads.
"""

import frappe


def execute():
	if not frappe.db.has_column("POS Settings", "enable_sales_persons"):
		return
	from pos_next.sales_staff import make_the_missing_sales_persons, option_is_on

	if option_is_on():
		make_the_missing_sales_persons()

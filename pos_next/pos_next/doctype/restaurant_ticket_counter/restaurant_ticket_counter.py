# //// Neoffice — added file (no upstream equivalent). The counter behind the ticket numbers of a restaurant's orders
# //// (NeoResto lot 1, task 38b, rulings 122 and 124): one row per restaurant and counting period (its business day, or
# //// never, or its shift), holding the last number given. It is written only by `pos_next.restaurant.tickets`, in the
# //// transaction of the order that takes the number, under a row lock; nobody edits it by hand.
from frappe.model.document import Document


class RestaurantTicketCounter(Document):
	pass

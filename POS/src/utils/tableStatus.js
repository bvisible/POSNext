//// Neoffice — added file (no upstream equivalent). What the status of a table says about tapping it (NeoResto lot 1, Daniel, 01.11). Tapping a table opens its order (composables/useOpenTable); a table that has been
//// paid or is being cleaned has no order to load, and the cashier decides what happens to it instead (the payment summary, the cleaning). The floor's list and the notice of a guest's order share this rule.

/** Whether tapping a table does not open its order but brings up what the cashier decides for it (it has been paid, or it is being cleaned). */
export const tableNeedsCleaning = (table) => table?.status === "Paid" || table?.status === "Cleaning"

//// Neoffice — a table whose bill is settled while dishes or drinks are still to serve is Occupied with no open order, and the floor tells it is paid (order_summary.paid; the product owner, 08.11.2026: paying must not empty a table that
//// has not been served). Tapping it shows what was paid and what is left, where the waiter orders again on the table or frees it, instead of opening a new order under the plates.
/** Whether a table is paid but still holds dishes to serve. */
export const tableIsPaidAtService = (table) => table?.status === "Occupied" && table?.order_summary?.paid === true

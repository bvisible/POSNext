/**
 * Invoice utility functions
 * Common helpers for invoice-related operations across the application
 */

/**
 * Get the appropriate CSS classes for invoice status badge
 * @param {Object} invoice - Invoice object with status and docstatus fields
 * @returns {string} Tailwind CSS classes for the status badge
 */
export function getInvoiceStatusColor(invoice) {
	const status = invoice.status?.toLowerCase()

	// Red for overdue, cancelled
	//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
	if (status === "overdue" || invoice.docstatus === 2) {
		return "bg-red-100 text-red-800"
	}

	// Orange for partly paid (partial payment received)
	//// Neoffice — from here to the end of the file the divergence from upstream is a single
	//// cause: the repo-wide Biome pass of 458d81a9 (2026-03-20 "remove BrainWise branding, add
	//// restaurant mode, and code formatting") rewrote every single-quoted string to double
	//// quotes. No status, no colour and no branch changed.
	if (status === "partly paid" || status === "partially paid") {
		return "bg-orange-100 text-orange-800"
	}

	// Yellow for unpaid
	//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double.
	if (status === "unpaid") {
		return "bg-yellow-100 text-yellow-800"
	}

	// Blue for credit note issued
	//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double.
	if (status === "credit note issued") {
		return "bg-blue-100 text-blue-800"
	}

	// Green for paid, submitted
	//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double.
	if (status === "paid" || invoice.docstatus === 1) {
		return "bg-green-100 text-green-800"
	}

	// Gray for draft and others
	//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double.
	return "bg-gray-100 text-gray-800"
}

/**
 * Get status color theme name for use with Badge component
 * @param {string} status - Invoice status string
 * @returns {string} Theme name (red, yellow, blue, green, gray)
 */
export function getInvoiceStatusTheme(status) {
	const statusLower = status?.toLowerCase()

	//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double.
	if (statusLower === "overdue" || statusLower === "cancelled") {
		return "red"
	}

	//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double.
	if (statusLower === "partly paid" || statusLower === "partially paid") {
		return "orange"
	}

	//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double.
	if (statusLower === "unpaid") {
		return "yellow"
	}

	//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double.
	if (statusLower === "credit note issued") {
		return "blue"
	}

	//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double.
	if (statusLower === "paid") {
		return "green"
	}

	//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double.
	return "gray"
}

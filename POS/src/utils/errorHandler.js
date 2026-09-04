/**
 * Common Error Handler for API Exceptions
 * Provides consistent error parsing and user-friendly messages
 *
 * Usage:
 *
 * import { parseError } from '@/utils/errorHandler'
 *
 * try {
 *   await api.submitInvoice()
 * } catch (error) {
 *   const errorContext = parseError(error)
 *   // errorContext = { title, message, type, technicalDetails, retryable }
 *
 *   // Set dialog state
 *   errorTitle.value = errorContext.title
 *   errorMessage.value = errorContext.message
 *   showErrorDialog.value = true
 * }
 */

/**
 * Clean HTML and extra whitespace from error messages
 */
function cleanErrorMessage(rawMessage) {
	if (!rawMessage) return ""

	if (Array.isArray(rawMessage)) {
		return cleanErrorMessage(rawMessage[0])
	}

	if (typeof rawMessage === "object" && rawMessage !== null) {
		return cleanErrorMessage(
			rawMessage.message || rawMessage.title || rawMessage.value,
		)
	}

	let text = typeof rawMessage === "string" ? rawMessage : String(rawMessage)

	// Remove HTML tags
	if (typeof window !== "undefined" && typeof document !== "undefined") {
		const container = document.createElement("div")
		container.innerHTML = text
		text = container.textContent || container.innerText || ""
	} else {
		text = text.replace(/<[^>]*>/g, " ")
	}

	return text.replace(/\s+/g, " ").trim()
}

/**
 * Parse error and return structured error information
 * @param {Error} error - The error object from API call
 * @returns {Object} - Structured error information
 */
export function parseError(error) {
	const context = {
		title: __("Error"),
		message: __("An unexpected error occurred"),
		type: "error", // error, warning, validation
		retryable: false,
		technicalDetails: null,
	}

	//// Neoffice — added guard. frappe-ui's call() can reject with `undefined` or a primitive
	//// (aborted fetch, unconfigured POS Profile) and upstream read error.exc_type straight
	//// away — so the helper whose job is to make errors readable threw its own TypeError, and
	//// the cashier got "Cannot read properties of undefined (reading 'exc_type')" verbatim in
	//// the TWINT dialog, hiding the real failure (e2ac6de4, 2026-06-22 "suppress cryptic JS
	//// error when devices fail to load").
	// Defensive: some call sites (especially aborted fetches and the resource
	// wrapper) reject with `undefined` or a primitive. Reading `.exc_type` on
	// that would throw "Cannot read properties of undefined (reading 'exc_type')"
	// and get re-displayed verbatim — masking the real failure.
	if (!error || typeof error !== "object") {
		return context
	}

	// Build technical details
	const detailsParts = []
	//// Neoffice — Biome reformat only from here: single quotes rewritten to double inside
	//// __() — same msgids, so the French PO is unaffected (458d81a9, 2026-03-20 "remove BrainWise
	//// branding, add restaurant mode, and code formatting").
	//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
	if (error.exc_type) detailsParts.push(__("Type: {0}", [error.exc_type]))
	//// Neoffice — same Biome pass (458d81a9): quotes, and the two push() calls moved onto
	//// their own lines under the `if`. Same msgids.
	if (error.httpStatus || error.status)
		detailsParts.push(__("Status: {0}", [error.httpStatus || error.status]))
	if (error.exception)
		detailsParts.push(__("Exception: {0}", [error.exception], "Error"))
	context.technicalDetails =
		detailsParts.length > 0 ? detailsParts.join(" | ") : null

	// Detect error type from status code
	if (error.httpStatus === 417 || error.status === 417) {
		context.type = "validation"
		context.title = __("Validation Error")
	} else if (error.httpStatus === 403 || error.status === 403) {
		context.type = "error"
		context.title = __("Permission Denied")
	} else if (error.httpStatus === 404 || error.status === 404) {
		context.type = "warning"
		context.title = __("Not Found")
	} else if (error.httpStatus >= 500 || error.status >= 500) {
		context.type = "error"
		context.title = __("Server Error")
	}

	// Extract primary message
	if (
		error.messages &&
		Array.isArray(error.messages) &&
		error.messages.length > 0
	) {
		context.message = cleanErrorMessage(error.messages[0])
	} else if (error._server_messages) {
		try {
			const serverMessages = JSON.parse(error._server_messages)
			if (serverMessages && serverMessages.length > 0) {
				const firstMessage = JSON.parse(serverMessages[0])
				context.message = cleanErrorMessage(
					firstMessage.message || firstMessage.title,
				)
				if (firstMessage.title) context.title = firstMessage.title
			}
		} catch (parseError) {
			console.error("Error parsing _server_messages:", parseError)
		}
	} else if (error.message) {
		context.message = cleanErrorMessage(error.message)
	}

	// Categorize by exception type and message content
	const normalizedMessage = (context.message || "").toLowerCase()
	const excType = (error.exc_type || "").toLowerCase()

	// Insufficient Stock
	if (
		excType === "negativestockerror" ||
		normalizedMessage.includes("needed in") ||
		normalizedMessage.includes("insufficient stock") ||
		normalizedMessage.includes("negative stock")
	) {
		context.type = "warning"
		context.title = __("Insufficient Stock")

		// Parse the message to extract item and quantity information
		// Example: "1.0 units of Item IPhone 17-WHI needed in Warehouse Goods In Transit - BrD"
		const match = context.message.match(
			/(\d+\.?\d*)\s+units?\s+of\s+(?:Item\s+)?(.+?)\s+needed\s+in\s+(?:Warehouse\s+)?(.+?)(?:\s+to complete|$)/i,
		)

		if (match) {
			const [, quantity, itemName, warehouse] = match
			const qty = Number.parseFloat(quantity)
			//// Neoffice — upstream built this shortage message by string interpolation, so it stayed
			//// English on a French-speaking till. Rewritten as one __() msgid with positional slots —
			//// the singular/plural unit word included — and shipped in the French PO (ef2cbcfd,
			//// 2026-07-09 "don't stock-block non-stock items scanned from the search bar").
			const unit = qty === 1 ? __("unit") : __("units")
			context.message = __(
				'Not enough stock for "{0}".\n\nYou need {1} {2} but the warehouse "{3}" doesn\'t have enough available.\n\nPlease reduce the quantity or check another warehouse.',
				[itemName, qty, unit, warehouse],
			)
		} else if (
			!context.message ||
			context.message === "An unexpected error occurred"
		) {
			//// Neoffice — same Biome formatter pass (458d81a9): the __() call reflowed, same msgid.
			context.message = __(
				"Not enough stock available in the warehouse.\n\nPlease reduce the quantity or check stock availability.",
			)
		}

		context.retryable = true
	}
	// Validation Errors
	else if (excType === "validationerror" || context.type === "validation") {
		context.type = "validation"
		context.title = __("Validation Error")
		context.retryable = true
	}
	// Price List Errors
	else if (
		normalizedMessage.includes("price list") ||
		normalizedMessage.includes("price not found")
	) {
		context.type = "warning"
		context.title = __("Pricing Error")
		context.retryable = true
	}
	// Customer/Party Errors
	else if (
		normalizedMessage.includes("customer") ||
		normalizedMessage.includes("party")
	) {
		context.type = "validation"
		context.title = __("Customer Error")
		context.retryable = true
	}
	// Tax Errors
	else if (
		normalizedMessage.includes("tax") ||
		normalizedMessage.includes("account")
	) {
		context.type = "warning"
		context.title = __("Tax Configuration Error")
		context.retryable = false
	}
	// Payment Errors
	else if (
		normalizedMessage.includes("payment") ||
		normalizedMessage.includes("mode of payment")
	) {
		context.type = "validation"
		context.title = __("Payment Error")
		context.retryable = true
	}
	// Series/Naming Errors
	else if (
		normalizedMessage.includes("series") ||
		normalizedMessage.includes("naming")
	) {
		context.type = "error"
		context.title = __("Naming Series Error")
		context.retryable = false
	}
	// Permission Errors
	else if (
		normalizedMessage.includes("permission") ||
		normalizedMessage.includes("not allowed")
	) {
		context.type = "error"
		context.title = __("Permission Denied")
		context.retryable = false
	}
	// Network/Connection Errors
	else if (
		normalizedMessage.includes("network") ||
		normalizedMessage.includes("timeout") ||
		normalizedMessage.includes("connection") ||
		normalizedMessage.includes("fetch")
	) {
		context.type = "warning"
		context.title = __("Connection Error")
		//// Neoffice — same Biome formatter pass (458d81a9): the __() call reflowed, same msgid.
		context.message = __(
			"Unable to connect to server. Check your internet connection.",
		)
		context.retryable = true
	}
	// Duplicate Errors
	else if (
		normalizedMessage.includes("duplicate") ||
		normalizedMessage.includes("already exists")
	) {
		context.type = "validation"
		context.title = __("Duplicate Entry")
		context.retryable = false
	}

	return context
}

/**
 * Format error for clipboard (for reporting)
 * @param {Object} errorContext - Parsed error context
 * @param {Object} additionalInfo - Additional context (user, profile, etc)
 * @returns {string} - Formatted error report
 */
export function formatErrorReport(errorContext, additionalInfo = {}) {
	const lines = [
		//// Neoffice — product name in the error-report header: upstream writes "Error Report -
		//// POS Next" (771950bd, 2026-04-02 "rebrand: rename POS Next to Neopos"). The msgid
		//// changed with it, so this string has its own entry in the French PO.
		//// rebrand: rename POS Next to Neopos — 771950b
		__("Error Report - Neopos"),
		"=".repeat(40),
		//// Neoffice — same Biome pass (458d81a9): single quotes rewritten to double inside these
		//// three __() calls. Same msgids.
		__("Title: {0}", [errorContext.title]),
		__("Type: {0}", [errorContext.type]),
		__("Message: {0}", [errorContext.message]),
		"",
	]

	if (errorContext.technicalDetails) {
		//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double inside __().
		lines.push(__("Technical: {0}", [errorContext.technicalDetails]))
		lines.push("")
	}

	if (additionalInfo.timestamp) {
		//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double inside __().
		lines.push(__("Timestamp: {0}", [additionalInfo.timestamp]))
	}
	if (additionalInfo.user) {
		//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double inside __().
		lines.push(__("User: {0}", [additionalInfo.user]))
	}
	if (additionalInfo.posProfile) {
		//// Neoffice — same Biome formatter pass (458d81a9): single quotes rewritten to double inside __().
		lines.push(__("POS Profile: {0}", [additionalInfo.posProfile]))
	}

	return lines.join("\n")
}

/**
 * Get toast icon class based on error type
 * @param {string} errorType - error, warning, or validation
 * @returns {string} - Tailwind CSS class
 */
export function getErrorIconClass(errorType) {
	switch (errorType) {
		case "error":
			return "text-red-600"
		case "warning":
			return "text-orange-600"
		case "validation":
			return "text-yellow-600"
		default:
			return "text-red-600"
	}
}

/**
 * Handle API error with toast notification
 * @param {Error} error - The error object
 * @param {Function} toastFn - Toast creation function
 * @param {Object} options - Additional options
 */
export function handleApiError(error, toastFn, options = {}) {
	const errorContext = parseError(error)

	const toastOptions = {
		title: errorContext.title,
		text: errorContext.message,
		icon: "alert-circle",
		iconClasses: getErrorIconClass(errorContext.type),
		timeout: options.timeout || 6000,
	}

	if (toastFn) {
		toastFn(toastOptions)
	}

	return errorContext
}

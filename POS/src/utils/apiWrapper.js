//// Neoffice — frappe-ui's `call` threw a TypeError on an error answer that is not JSON (a 403 page for a visitor): ours reads it as a
//// refusal with its status (maintenance#1975, utils/frappeRequest.js)
import { call as frappeCall } from "./frappeRequest";

import { forceRefreshCSRFToken, isCSRFApiError } from "./csrf";

// Wrapped call function with CSRF auto-refresh
export async function call(method, params) {
	try {
		return await frappeCall(method, params);
	} catch (error) {
		if (isCSRFApiError(error)) {
			console.warn("CSRF token error in call(), refreshing token and retrying...");
			const refreshed = await forceRefreshCSRFToken();

			if (refreshed) {
				console.log("Retrying call after CSRF refresh...");
				return await frappeCall(method, params);
			}

			console.warn("Could not refresh CSRF token. Server may have ignore_csrf enabled.");
		}

		throw error;
	}
}

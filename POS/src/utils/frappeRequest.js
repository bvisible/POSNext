//// Neoffice — added file (no upstream equivalent). frappe-ui reads an error answer as JSON (`frappeRequest.js` and `call.js` of the package:
//// `JSON.parse` in a try, then `error.exc` outside it). A refusal answered as an HTML page (Frappe's 403 « Redirecting… » for a visitor on a
//// method that wants a session, a proxy's 502 page) left `error` undefined, and the reader itself threw `TypeError: Cannot read properties of
//// undefined (reading 'exc')`: the status was lost, a caller could not tell a refusal from a bug, and every guest page of the till logged
//// TypeErrors (maintenance#1975). These are the package's two readers with the answer read once: as JSON when it is JSON, as nothing otherwise,
//// and the error is then a refusal that says its status. The till uses them as frappe-ui's resource fetcher (main.js) and as `call`
//// (apiWrapper.js). Drop this file when frappe-ui reads a body that is not JSON without throwing.

import { getConfig, request } from "frappe-ui";

// The words a refusal says when the server said none, in the till's language once its dictionary is loaded (literal calls: the extractor reads them)
const NOT_PERMITTED = () => (typeof __ === "function" ? __("Not permitted") : "Not permitted");
const SERVER_ERROR = () =>
	typeof __ === "function" ? __("Internal Server Error") : "Internal Server Error";

/** The JSON of an answer's text, or an empty object when the text is no JSON object (an HTML page, an empty body). */
export function parseErrorBody(text) {
	try {
		const parsed = JSON.parse(text);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

/** What a server message says: its `message` when it is one of Frappe's JSON messages, the text itself otherwise. */
function messageText(message) {
	try {
		return JSON.parse(message).message;
	} catch {
		return message;
	}
}

/**
 * The error of a refused answer, as frappe-ui builds it (`exc_type`, `exc`, `messages`, `response`), whatever the body was. A body that is no
 * JSON (an HTML page) gives an error with the answer's status and a message that says what the status means, never a TypeError.
 *
 * @param {string} label - What was called (the URL or the method), at the head of the message
 * @param {{ status?: number }} response - The fetch Response
 * @param {string} text - The body of the answer, read once
 * @returns {Error & { exc_type?: string, exc?: unknown, status?: number, messages: string[], response?: unknown }}
 */
export function errorFromAnswer(label, response, text) {
	const error = parseErrorBody(text);
	let exception;
	if (error.exc) {
		exception = error.exc;
		try {
			exception = JSON.parse(exception)[0];
		} catch {
			// the traceback stays as the server wrote it
		}
	}
	const e = new Error([label, error.exc_type, error._error_message].filter(Boolean).join(" "));
	e.exc_type = error.exc_type;
	e.exc = exception;
	e.response = response;
	e.status = response?.status;
	let messages = error._server_messages ? parseErrorBody(error._server_messages) : [];
	if (!Array.isArray(messages)) messages = [];
	e.messages = messages.concat(error.message).map(messageText).filter(Boolean);
	if (!e.messages.length) {
		if (error._error_message) e.messages = [error._error_message];
		else if (response?.status === 401 || response?.status === 403)
			e.messages = [NOT_PERMITTED()];
		else e.messages = [SERVER_ERROR()];
	}
	return e;
}

function printServerTraceback(label, details, exc) {
	try {
		console.groupCollapsed(label);
		console.log(details);
		for (const text of JSON.parse(exc)) console.log(text);
		console.groupEnd();
	} catch (error) {
		console.warn("Error printing debug messages", error);
	}
}

/** frappe-ui's `frappeRequest` (the fetcher of `createResource`), with an error answer that is not JSON read without throwing. */
export function frappeRequest(options) {
	return request({
		...options,
		transformRequest: (requestOptions = {}) => {
			if (!requestOptions.url) throw new Error("[frappeRequest] options.url is required");
			const headers = Object.assign(
				{
					Accept: "application/json",
					"Content-Type": "application/json; charset=utf-8",
					"X-Frappe-Site-Name": window.location.hostname,
				},
				requestOptions.headers || {}
			);
			if (window.csrf_token && window.csrf_token !== "{{ csrf_token }}")
				headers["X-Frappe-CSRF-Token"] = window.csrf_token;
			let url = requestOptions.url;
			if (!url.startsWith("/") && !url.startsWith("http")) url = `/api/method/${url}`;
			return { ...requestOptions, url, method: requestOptions.method || "POST", headers };
		},
		transformResponse: async (response, requestOptions) => {
			const url = requestOptions.url;
			if (response.ok) {
				const data = await response.json();
				if (data.docs || url === "/api/method/login") return data;
				if (data.exc) printServerTraceback(url, requestOptions, data.exc);
				if (data._server_messages) {
					const onMessage =
						getConfig("serverMessagesHandler") ||
						requestOptions.onServerMessages ||
						null;
					if (onMessage) onMessage(JSON.parse(data._server_messages) || []);
				}
				return data.message;
			}
			const e = errorFromAnswer(url, response, await response.text());
			if (requestOptions.onError) requestOptions.onError(e);
			throw e;
		},
		transformError: (error) => {
			if (options.onError) options.onError(error);
			throw error;
		},
	});
}

/** frappe-ui's `call` (a whitelisted method, by POST), with an error answer that is not JSON read without throwing. */
export async function call(method, args, options = {}) {
	const headers = Object.assign(
		{
			Accept: "application/json",
			"Content-Type": "application/json; charset=utf-8",
			"X-Frappe-Site-Name": window.location.hostname,
		},
		options.headers || {}
	);
	if (window.csrf_token && window.csrf_token !== "{{ csrf_token }}")
		headers["X-Frappe-CSRF-Token"] = window.csrf_token;
	const path = method.startsWith("/") ? method : `/api/method/${method}`;
	const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(args || {}) });
	if (res.ok) {
		const data = await res.json();
		if (data.docs || method === "login") return data;
		if (data.exc) printServerTraceback(method, { method, params: args }, data.exc);
		return data.message;
	}
	const e = errorFromAnswer(method, res, await res.text());
	if (options.onError) options.onError({ response: res, status: res.status, error: e });
	throw e;
}

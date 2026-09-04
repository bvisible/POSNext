//// Neoffice — upstream imported socketio_port from
//// ../../../../sites/common_site_config.json at build time. That path only exists inside
//// a bench, so the SPA could not be built anywhere else — and the value is per-site
//// anyway. The import is gone; port and protocol are derived from window.location below
//// (c3b5a4be, 2026-03-19 "resolve build errors after merge (socket.js import, duplicate
//// declarations)"). The subject on the next line is a wrong attribution left by the
//// May-2026 annotate_fork.py pass.
//// Add Inter font styles and integrate Frappe UI components — 081f782
import { io } from "socket.io-client"

let socket = null

export function initSocket(siteNameOverride) {
	// Don't reinitialize if socket already exists
	if (socket) {
		console.log("Socket already initialized")
		return socket
	}

	try {
		// Try to get site name from various sources, prioritizing override
		const siteName =
			siteNameOverride ||
			window.site_name ||
			(window.frappe && window.frappe.boot && window.frappe.boot.sitename) ||
			window.location.hostname

		const host = window.location.hostname
		//// Neoffice — upstream built the URL from the bench's socketio_port and inferred the
		//// protocol from whether a port was present, which gives http on any https deployment
		//// served through a non-default port. Frappe's nginx proxies Socket.IO on the same
		//// origin as the page, so both are now read off window.location (c3b5a4be, 2026-03-19
		//// "resolve build errors after merge (socket.js import, duplicate declarations)").
		//// resolve build errors after merge (socket.js import, duplicate declara… — c3b5a4b
		// Use same port/protocol as the current page (Frappe proxies Socket.IO)
		const protocol = window.location.protocol === "https:" ? "https" : "http"
		const portPart = window.location.port ? `:${window.location.port}` : ""
		const url = `${protocol}://${host}${portPart}/${siteName}`

		console.log("Initializing socket (lazy connection):", url)

		socket = io(url, {
			withCredentials: true,
			reconnectionAttempts: 3,
			autoConnect: false, // Lazy connect - only connect when explicitly needed
		})

		// Connect with error handling
		socket.on("connect_error", (error) => {
			console.warn("Socket connection error:", error.message)
		})

		socket.on("connect", () => {
			console.log("Socket connected successfully")
		})

		// Don't auto-connect - let components connect when they need realtime features
		// Components can call socket.connect() when they need realtime functionality

		return socket
	} catch (error) {
		console.error("Failed to initialize socket:", error)
		// Return a mock socket object to prevent crashes
		return {
			//// Neoffice — Biome reformat only: the empty arrow bodies of this crash-guard mock lost
			//// their inner space, `() => { }` became `() => {}` (458d81a9, 2026-03-20 "remove BrainWise
			//// branding, add restaurant mode, and code formatting").
			//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
			on: () => {},
			emit: () => {},
			connect: () => {},
			disconnect: () => {},
		}
	}
}

export function disconnectSocket() {
	if (socket) {
		socket.disconnect()
		socket = null
		console.log("Socket disconnected and cleared")
	}
}

export function useSocket() {
	return socket
}

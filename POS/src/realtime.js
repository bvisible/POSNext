/**
 * Frappe Realtime Compatibility Layer
 *
 * Creates a window.frappe.realtime interface compatible with Frappe's
 * Socket.IO implementation. This allows composables that rely on
 * window.frappe.realtime to work in the standalone POS app.
 *
 * Usage:
 *   import { initRealtime } from './realtime'
 *   await initRealtime() // Call once at app startup (async)
 *
 * Then composables can use:
 *   window.frappe.realtime.on('event_name', handler)
 *   window.frappe.realtime.off('event_name', handler)
 */

import { io } from "socket.io-client"
import { logger } from "./utils/logger"

const log = logger.create("Realtime")

let socket = null
let isInitialized = false

/**
 * Get Socket.IO port from common_site_config.json
 * Falls back to standard ports if not available
 */
function getSocketIOPort() {
	try {
		// Try to import from common_site_config.json
		// This might fail in production builds
		return null // Will use same port as HTTP
	} catch {
		return null
	}
}

/**
 * Get the Frappe site name for Socket.IO namespace
 * The site name is used as the Socket.IO namespace (e.g., /prod.local)
 *
 * Priority:
 * 1. window.frappe.boot.sitename (set by Frappe)
 * 2. localStorage cache (frappe_site_name)
 * 3. API call to get_site_info (and cache result)
 * 4. Fallback to window.location.hostname
 */
async function getSiteName() {
	// 1. Try to get from window.frappe.boot (set by Frappe)
	if (window.frappe?.boot?.sitename) {
		log.debug("Site name from frappe.boot", {
			sitename: window.frappe.boot.sitename,
		})
		return window.frappe.boot.sitename
	}

	// 2. Check localStorage cache
	const cachedSiteName = localStorage.getItem("frappe_site_name")
	if (cachedSiteName) {
		log.debug("Site name from localStorage cache", { sitename: cachedSiteName })
		return cachedSiteName
	}

	// 3. Try to fetch from API
	try {
		log.debug("Fetching site name from API...")
		const response = await fetch(
			"/api/method/pos_next.api.utilities.get_site_info",
			{
				method: "GET",
				credentials: "include",
				headers: {
					Accept: "application/json",
				},
			},
		)

		if (response.ok) {
			const data = await response.json()
			if (data.message?.site_name) {
				const siteName = data.message.site_name
				localStorage.setItem("frappe_site_name", siteName)
				log.info("Site name fetched and cached", { sitename: siteName })
				return siteName
			}
		}
	} catch (error) {
		log.warn("Could not fetch site name from API", { error: error.message })
	}

	// 4. Fallback to hostname (works for single-site setups where hostname = site name)
	const hostname = window.location.hostname
	log.warn("Using hostname as fallback site name", { hostname })
	return hostname
}

/**
 * Initialize the realtime connection and expose window.frappe.realtime
 * This function is async because getSiteName() may need to fetch from API
 */
export async function initRealtime() {
	if (isInitialized) {
		log.debug("Realtime already initialized")
		return
	}

	try {
		// Build Socket.IO URL
		// Frappe's Socket.IO uses the site name as namespace
		const host = window.location.hostname
		const port = window.location.port
		const protocol = window.location.protocol === "https:" ? "https" : "http"

		// For production, use same origin (Socket.IO connects to same server)
		// For development with socketio_port, use that port
		const socketioPort = getSocketIOPort()
		const url = socketioPort
			? `${protocol}://${host}:${socketioPort}`
			: `${protocol}://${host}${port ? `:${port}` : ""}`

		// Get site name dynamically (may involve API call)
		const siteName = await getSiteName()
		const namespace = `/${siteName}`

		log.info("Initializing Socket.IO realtime", { url, namespace, siteName })

		socket = io(`${url}${namespace}`, {
			withCredentials: true,
			reconnectionAttempts: 5,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 5000,
			timeout: 20000,
			transports: ["websocket", "polling"],
		})

		// Connection event handlers
		socket.on("connect", () => {
			log.info("Socket.IO connected", { id: socket.id })
		})

		socket.on("disconnect", (reason) => {
			log.warn("Socket.IO disconnected", { reason })
		})

		socket.on("connect_error", (error) => {
			log.error("Socket.IO connection error", { message: error.message })
		})

		socket.on("reconnect", (attemptNumber) => {
			log.info("Socket.IO reconnected", { attempt: attemptNumber })
		})

		socket.on("reconnect_error", (error) => {
			log.warn("Socket.IO reconnection error", { message: error.message })
		})

		// Create Frappe-compatible realtime interface
		const realtime = {
			socket: socket,

			/**
			 * Subscribe to a realtime event
			 * @param {string} event - Event name
			 * @param {Function} callback - Event handler
			 */
			on(event, callback) {
				if (!socket) {
					log.warn("Cannot subscribe - socket not initialized", { event })
					return
				}
				log.debug("Subscribing to event", { event })
				socket.on(event, callback)
			},

			/**
			 * Unsubscribe from a realtime event
			 * @param {string} event - Event name
			 * @param {Function} callback - Event handler to remove
			 */
			off(event, callback) {
				if (!socket) {
					log.warn("Cannot unsubscribe - socket not initialized", { event })
					return
				}
				log.debug("Unsubscribing from event", { event })
				socket.off(event, callback)
			},

			/**
			 * Emit an event to the server
			 * @param {string} event - Event name
			 * @param {*} data - Event data
			 */
			emit(event, data) {
				if (!socket) {
					log.warn("Cannot emit - socket not initialized", { event })
					return
				}
				socket.emit(event, data)
			},

			/**
			 * Check if socket is connected
			 * @returns {boolean}
			 */
			get connected() {
				return socket?.connected || false
			},
		}

		// Expose as window.frappe.realtime for compatibility
		if (!window.frappe) {
			window.frappe = {}
		}
		window.frappe.realtime = realtime

		isInitialized = true
		log.info("Realtime initialized successfully")
	} catch (error) {
		log.error("Failed to initialize realtime", error)

		// Create a no-op realtime to prevent crashes
		if (!window.frappe) {
			window.frappe = {}
		}
		window.frappe.realtime = {
			on: () => {},
			off: () => {},
			emit: () => {},
			connected: false,
		}
	}
}

/**
 * Disconnect and cleanup realtime
 */
export function disconnectRealtime() {
	if (socket) {
		socket.disconnect()
		socket = null
	}
	isInitialized = false
	log.info("Realtime disconnected")
}

/**
 * Get the raw socket instance (for advanced use)
 */
export function getSocket() {
	return socket
}

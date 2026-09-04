import router from "@/router"
import { createResource } from "frappe-ui"
import { computed, reactive } from "vue"

const getCookie = (key) => {
	const cookies = new Map(
		//// Neoffice — Biome reformat only: the cookie parse chain broken onto one call per line
		//// and given a trailing comma. Same Map, same decodeURIComponent (458d81a9, 2026-03-20 "remove
		//// BrainWise branding, add restaurant mode, and code formatting").
		//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
		document.cookie
			.split("; ")
			.filter(Boolean)
			.map((c) => c.split("=").map(decodeURIComponent)),
	)
	return cookies.get(key) || null
}

export const userData = reactive({
	userId: null,
	fullName: null,
	userImage: null,

	refresh() {
		const userId = getCookie("user_id")
		const fullName = getCookie("full_name")
		const userImage = getCookie("user_image")

		// Only update if we have valid data (not Guest)
		if (userId && userId !== "Guest") {
			this.userId = userId
			this.fullName = fullName
			this.userImage = userImage
		}
	},

	getDisplayName() {
		//// Neoffice — FORMATTING ONLY. Biome pass of 458d81a9 (2026-03-20 "remove BrainWise
		//// branding, add restaurant mode, and code formatting") rewrapped this one-line return
		//// to 80 columns. Identical behaviour. At the next merge take upstream's file and
		//// re-run `biome check --write` rather than resolving the reflow by hand.
		return (
			this.fullName ||
			window.frappe?.session?.user_fullname ||
			window.frappe?.session?.user ||
			"User"
		)
	},

	getImageUrl() {
		return this.userImage || window.frappe?.session?.user_image || null
	},

	getInitials() {
		const parts = this.getDisplayName().split(" ").filter(Boolean)
		//// Neoffice — FORMATTING ONLY: same Biome pass (458d81a9), ternary rewrapped over
		//// three lines. No behaviour change.
		return parts.length >= 2
			? (parts[0][0] + parts[1][0]).toUpperCase()
			: this.getDisplayName().substring(0, 2).toUpperCase()
	},
})

// Initial refresh
userData.refresh()

// Watch for cookie changes (e.g., after login) and auto-refresh
// This uses MutationObserver to detect document.cookie changes
//// Neoffice — FORMATTING ONLY: same Biome pass (458d81a9), single quotes -> double
//// quotes. No behaviour change.
if (typeof window !== "undefined") {
	let lastCookie = document.cookie
	setInterval(() => {
		if (document.cookie !== lastCookie) {
			lastCookie = document.cookie
			userData.refresh()
		}
	}, 500) // Check every 500ms for cookie changes
}

export const useUserData = () => ({
	userName: computed(() => userData.getDisplayName()),
	userImage: computed(() => userData.getImageUrl()),
	userInitials: computed(() => userData.getInitials()),
	userId: computed(() => userData.userId),
	refresh: () => userData.refresh(),
})

export const userResource = createResource({
	url: "frappe.auth.get_logged_user",
	cache: "User",
	onError(error) {
		if (error?.exc_type === "AuthenticationError") {
			router.push({ name: "Login" })
		}
	},
})

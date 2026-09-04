import { shiftState } from "@/composables/useShift"
import { userResource } from "@/data/user"
import { createRouter, createWebHistory } from "vue-router"
import { session } from "./data/session"

const routes = [
	{
		path: "/",
		name: "POSSale",
		component: () => import("@/pages/POSSale.vue"),
	},
	{
		name: "Login",
		path: "/account/login",
		component: () => import("@/pages/Login.vue"),
	},
	//// Neoffice — eight routes with no upstream equivalent. Upstream POSNext is a retail
	//// till: one cashier screen. Neoffice sells it to restaurants and takeaways, so the
	//// router also serves the customer display (/display, /cfd), the kitchen and runner
	//// screens (/kds, /runner), the takeaway counter (/takeaway) and the pages a diner opens
	//// on their own phone with no account at all — QR self-ordering (/guest/:token), web
	//// takeaway (/order) and online booking (/reservation). Those carry meta.allowGuest,
	//// honoured by the guard below (185c3c50 2026-02-03, d59036f1 2026-03-23, 644ad918
	//// 2026-03-26, 3939a848 2026-03-28 "QR self-ordering and takeaway web ordering",
	//// ebc3ecc5 2026-03-29).
	//// QR self-ordering and takeaway web ordering — 3939a84 + 458d81a (+4 more)
	{
		name: "CustomerDisplay",
		path: "/display",
		component: () => import("@/pages/CustomerDisplay.vue"),
		meta: { allowGuest: true }, // Allow access without session login
	},
	{
		name: "KDS",
		path: "/kds",
		component: () => import("@/pages/KDS.vue"),
	},
	{
		name: "CFD",
		path: "/cfd",
		component: () => import("@/pages/CFD.vue"),
		meta: { allowGuest: true },
	},
	{
		name: "Runner",
		path: "/runner",
		component: () => import("@/pages/Runner.vue"),
	},
	{
		name: "Takeaway",
		path: "/takeaway",
		component: () => import("@/pages/Takeaway.vue"),
	},
	{
		name: "GuestOrder",
		path: "/guest/:token",
		component: () => import("@/pages/GuestOrder.vue"),
		meta: { allowGuest: true },
	},
	{
		name: "TakeawayOrder",
		path: "/order",
		component: () => import("@/pages/TakeawayOrder.vue"),
		meta: { allowGuest: true },
	},
	{
		name: "GuestReservation",
		path: "/reservation",
		component: () => import("@/pages/GuestReservation.vue"),
		meta: { allowGuest: true },
	},
	// Catch-all route
	{
		path: "/:pathMatch(.*)*",
		redirect: "/",
	},
]

const router = createRouter({
	history: createWebHistory("/pos"),
	routes,
})

router.beforeEach((to, from, next) => {
	// Check authentication status (session.user is already set in main.js before app mount)
	const isLoggedIn = session.isLoggedIn

	// Only log during development
	if (import.meta.env.DEV) {
		console.log(
			`[Router] ${to.name} (from: ${from.name || "initial"}), auth: ${isLoggedIn}`,
		)
	}

	//// Neoffice — added guard. Upstream's beforeEach sends every visitor without a session
	//// to /account/login, a dead end for the screens that have no user at all: a paired
	//// customer display, and a diner opening a QR menu on their own phone. Routes flagged
	//// meta.allowGuest are let through; everything else keeps upstream's redirect (185c3c50,
	//// 2026-02-03 "use dynamic customer group and territory lookup for customer display").
	//// use dynamic customer group and territory lookup for customer display — 185c3c5
	// Allow guest access to routes with meta.allowGuest (e.g., CustomerDisplay)
	if (to.meta?.allowGuest) {
		next()
		return
	}

	// Redirect logic
	if (to.name === "Login" && isLoggedIn) {
		next({ name: "POSSale" })
	} else if (to.name !== "Login" && !isLoggedIn) {
		next({ name: "Login" })
	} else {
		next()
	}
})

export default router

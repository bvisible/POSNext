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

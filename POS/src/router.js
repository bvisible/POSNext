import { shiftState } from "@/composables/useShift";
import { userResource } from "@/data/user";
//// Neoffice — the restaurant's own screens open only where the site runs NeoRestau (NeoRestau lot 1, task 4, fix round 1).
import { redirectWhereNeoRestauIsOff } from "@/utils/neorestau";
import { createRouter, createWebHistory } from "vue-router";
import { session } from "./data/session";

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
		//// Neoffice — a screen of the restaurant: opens only where the site runs NeoRestau (utils/neorestau.js).
		meta: { needsNeoRestau: true },
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
		//// Neoffice — a screen of the restaurant: opens only where the site runs NeoRestau (utils/neorestau.js).
		meta: { needsNeoRestau: true },
	},
	{
		name: "Takeaway",
		path: "/takeaway",
		component: () => import("@/pages/Takeaway.vue"),
		//// Neoffice — a screen of the restaurant: opens only where the site runs NeoRestau (utils/neorestau.js).
		meta: { needsNeoRestau: true },
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
];

const router = createRouter({
	history: createWebHistory("/pos"),
	routes,
});

router.beforeEach((to, from, next) => {
	// Check authentication status (session.user is already set in main.js before app mount)
	const isLoggedIn = session.isLoggedIn;

	// Only log during development
	if (import.meta.env.DEV) {
		console.log(`[Router] ${to.name} (from: ${from.name || "initial"}), auth: ${isLoggedIn}`);
	}

	//// Neoffice — added guard: the till's own screens of the restaurant (/kds, /runner, /takeaway) open only where the
	//// site runs NeoRestau; elsewhere the visitor goes back to the till, which sends him to the login if he has no
	//// session. It comes first: those screens may load with no till profile, and so no setting of the till to read.
	const elsewhere = redirectWhereNeoRestauIsOff(to);
	if (elsewhere) {
		next(elsewhere);
		return;
	}

	//// Neoffice — added guard. Upstream's beforeEach sends every visitor without a session
	//// to /account/login, a dead end for the screens that have no user at all: a paired
	//// customer display, and a diner opening a QR menu on their own phone. Routes flagged
	//// meta.allowGuest are let through; everything else keeps upstream's redirect (185c3c50,
	//// 2026-02-03 "use dynamic customer group and territory lookup for customer display").
	//// use dynamic customer group and territory lookup for customer display — 185c3c5
	// Allow guest access to routes with meta.allowGuest (e.g., CustomerDisplay)
	if (to.meta?.allowGuest) {
		next();
		return;
	}

	// Redirect logic
	if (to.name === "Login" && isLoggedIn) {
		//// Neoffice — and back: the door (the ?mode= query of NeoRestau's entry route, NeoRestau lot 1, task 5) must survive
		//// the redirect to the login page AND the redirect back from it, or a signed-in visitor who lands on the login page
		//// (the back button, a bookmark) would reach the till at the usual door. See the redirect to the login below.
		next({ name: "POSSale", query: to.query });
	} else if (to.name !== "Login" && !isLoggedIn) {
		//// Neoffice — upstream dropped the query string here. NeoRestau's entry route is /pos?mode=restaurant, the door that
		//// offers the restaurant's tills (NeoRestau lot 1, task 5). A visitor who is not signed in goes to the login first,
		//// and the shift dialog that opens there once he is signed in reads the door from the query of its route: without it
		//// a restaurant cashier would be offered the usual tills. Remove if upstream keeps the query on this redirect.
		next({ name: "Login", query: to.query });
	} else {
		next();
	}
});

export default router;

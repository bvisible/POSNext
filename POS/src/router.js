import { shiftState } from "@/composables/useShift";
import { userResource } from "@/data/user";
//// Neoffice — the restaurant's own screens open only where the site runs NeoRestau (NeoRestau lot 1, task 4, fix round 1).
import { redirectWhereNeoRestauIsOff } from "@/utils/neorestau";
//// Neoffice — where a paired tablet goes when the installed app starts at the till's address (NeoRestau lot 1, task 48).
import { whereTheTabletStarts } from "@/utils/tabletStart";
//// Neoffice — each screen names its tab (NeoRestau lot 1): the router writes it after every navigation, from the `title` of
//// the route; utils/tabTitle.js is the one place that writes the title of the tab.
import { showScreen } from "@/utils/tabTitle";
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
		//// Neoffice — `title` is the name of this screen's tab, translated when written (utils/tabTitle.js).
		meta: { allowGuest: true, title: () => __("Customer Display") }, // Allow access without session login
	},
	{
		name: "KDS",
		path: "/kds",
		component: () => import("@/pages/KDS.vue"),
		//// Neoffice — a screen of the restaurant: opens only where the site runs NeoRestau (utils/neorestau.js); a tablet
		//// signs in to it with a QR code (pairable: signed out, it is sent to the pairing page, not to a password).
		//// Neoffice — `title` is the name of this screen's tab, translated when written (utils/tabTitle.js).
		meta: { needsNeoRestau: true, pairable: true, title: () => __("Kitchen") },
	},
	{
		name: "CFD",
		path: "/cfd",
		component: () => import("@/pages/CFD.vue"),
		//// Neoffice — `title` is the name of this screen's tab, translated when written (utils/tabTitle.js).
		meta: { allowGuest: true, title: () => __("Customer Display") },
	},
	{
		name: "Runner",
		path: "/runner",
		component: () => import("@/pages/Runner.vue"),
		//// Neoffice — a screen of the restaurant: opens only where the site runs NeoRestau (utils/neorestau.js); a tablet
		//// signs in to it with a QR code (pairable: signed out, it is sent to the pairing page, not to a password).
		meta: { needsNeoRestau: true, pairable: true, title: () => __("Runner") },
	},
	//// Neoffice — the page a kitchen's or a runner's tablet opens by scanning the QR code a manager shows at the till
	//// (NeoRestau lot 1, task 16): open to a visitor (the tablet has no session yet), only where the site runs
	//// NeoRestau. The code rides in the fragment of the address (/pos/pair#<code>), which no request carries.
	{
		name: "PairDevice",
		path: "/pair",
		component: () => import("@/pages/PairDevice.vue"),
		meta: { allowGuest: true, needsNeoRestau: true },
	},
	{
		name: "Takeaway",
		path: "/takeaway",
		component: () => import("@/pages/Takeaway.vue"),
		//// Neoffice — a screen of the restaurant: opens only where the site runs NeoRestau (utils/neorestau.js).
		//// Neoffice — `title` is the name of this screen's tab, translated when written (utils/tabTitle.js).
		meta: { needsNeoRestau: true, title: () => __("Takeaway") },
	},
	{
		name: "GuestOrder",
		path: "/guest/:token",
		component: () => import("@/pages/GuestOrder.vue"),
		//// Neoffice — `title` is the name of this screen's tab, translated when written (utils/tabTitle.js).
		meta: { allowGuest: true, title: () => __("Order") },
	},
	{
		name: "TakeawayOrder",
		path: "/order",
		component: () => import("@/pages/TakeawayOrder.vue"),
		//// Neoffice — `title` is the name of this screen's tab, translated when written (utils/tabTitle.js).
		meta: { allowGuest: true, title: () => __("Order") },
	},
	{
		name: "GuestReservation",
		path: "/reservation",
		component: () => import("@/pages/GuestReservation.vue"),
		//// Neoffice — `title` is the name of this screen's tab, translated when written (utils/tabTitle.js).
		meta: { allowGuest: true, title: () => __("Reservation") },
	},
	//// Neoffice — the public menu (NeoRestau lot 1, task 17): the page that the one QR code on a restaurant's tables opens.
	//// Like the other pages a guest opens it is let through with no session (meta.allowGuest); it is not behind
	//// needsNeoRestau, which would send a guest to the till's login: the page asks the server, and says "This menu is not
	//// available" politely where the site does not run NeoRestau or the restaurant did not switch its public menu on.
	{
		name: "PublicMenu",
		path: "/menu/:restaurant",
		component: () => import("@/pages/PublicMenu.vue"),
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

//// Neoffice — added guard, first in line (NeoRestau lot 1, task 48). A kitchen's or runner's tablet is installed as an
//// app and every launch from its icon starts at /pos, the manifest's start_url: the route "/" is the till, whose shift
//// dialog asks for profiles a tablet's account may not read ("Aucun profil POS disponible ... PermissionError"). Such a
//// session is sent straight to ITS OWN screen (asked of the server, else the one it remembers), replacing the till's
//// address, before the till's page is even loaded: no dialog, no error, no flash of the till. It speaks only for a
//// session of the tablets' own accounts on a site that runs NeoRestau; a desk user, a visitor and a portal customer
//// pass through untouched (upstream's guard below runs as it always did). A tablet the server refuses, or that can
//// reach nothing and remembers nothing, goes to the pairing page, as a signed-out one does.
//// Neoffice — a failure here (a browser that refuses its cookies) must never stop a navigation: it passes on to the way it was going.
router.beforeEach(async (to) => {
	try {
		const start = await whereTheTabletStarts(to);
		if (!start) return true;
		if (start.pair) return { name: "PairDevice", replace: true };
		const { path, query, hash } = router.resolve(start.screen);
		return { path, query, hash, replace: true };
	} catch (error) {
		console.warn("[Router] the tablet's start could not be worked out", error);
		return true;
	}
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
		//// Neoffice — a kitchen's or runner's screen whose tablet is signed out goes to the pairing page instead, which says
		//// how to get a new code (and links to the login): a tablet has no password to type (NeoRestau lot 1, task 16).
		next(to.meta?.pairable ? { name: "PairDevice" } : { name: "Login", query: to.query });
	} else {
		next();
	}
});

//// Neoffice — the one place that names the tab of every screen (NeoRestau lot 1): once a navigation is done, the `title` of
//// its route is written, "<screen> · Neopos"; a route with none is plain "Neopos". A navigation that failed changed
//// nothing. A screen that learns a name later (the till, the kitchen, the guest pages) hands it to utils/tabTitle.js itself.
router.afterEach((to, from, failure) => {
	if (failure) return;
	//// Neoffice — a pop onto the location already on screen changes no screen: it is the Back that closed a dialog which had taken
	//// an entry of the history (composables/useBackClosesDialog.js), and the router answers it with a navigation to where it is.
	//// Renaming the tab for it would drop the name the page handed over (the till's, once its shift is open), and the till, which
	//// stays mounted, would not hand it over again.
	if (from.name && to.fullPath === from.fullPath) return;
	showScreen(to);
});

export default router;

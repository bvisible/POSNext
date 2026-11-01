import { computed, onMounted, onUnmounted, ref } from "vue"; //// Neoffice — `computed` joins the imports for the install entry of the user's menu (kitchen test, 01.11)

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_WINDOW_DAYS = 7;
const DISMISS_WINDOW_MS = DISMISS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const isClient = () => typeof window !== "undefined";

const isStandaloneDisplay = () => {
	if (!isClient()) return false;
	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		window.navigator.standalone === true
	);
};

const hasActiveDismissal = () => {
	if (!isClient()) return false;
	try {
		const stored = localStorage.getItem(DISMISS_KEY);
		if (!stored) return false;
		const dismissedAt = new Date(stored).getTime();
		if (Number.isNaN(dismissedAt)) {
			localStorage.removeItem(DISMISS_KEY);
			return false;
		}

		if (Date.now() - dismissedAt < DISMISS_WINDOW_MS) {
			return true;
		}

		localStorage.removeItem(DISMISS_KEY);
		return false;
	} catch (error) {
		console.warn("[PWA] Failed to read dismissal state", error);
		return false;
	}
};

//// Neoffice — the browser's install invitation is kept at MODULE level (kitchen test, 01.11): it is sent ONCE, when the page loads, and the install badge is only drawn in
//// the items view, so a waiter who looked at the tables, or opened the user's menu later, never saw the offer. Whoever asks later finds it here.
const sharedPrompt = ref(null);
const sharedInstallable = ref(false);
if (isClient()) {
	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		sharedPrompt.value = event;
		sharedInstallable.value = true;
	});
	window.addEventListener("appinstalled", () => {
		sharedPrompt.value = null;
		sharedInstallable.value = false;
	});
}

export function usePWAInstall() {
	//// Neoffice — the invitation and the flag are the module's, shared by every user of the composable (see sharedPrompt above)
	const deferredPrompt = sharedPrompt;
	const isInstallable = sharedInstallable;
	const isInstalled = ref(false);
	const showInstallBadge = ref(false);

	const updateInstalledState = () => {
		const installed = isStandaloneDisplay();
		isInstalled.value = installed;
		if (installed) {
			isInstallable.value = false;
			showInstallBadge.value = false;
			if (isClient()) {
				try {
					localStorage.removeItem(DISMISS_KEY);
				} catch (error) {
					console.warn("[PWA] Failed to clear dismissal state", error);
				}
			}
		}
		return installed;
	};

	const handleBeforeInstallPrompt = (event) => {
		event.preventDefault();
		deferredPrompt.value = event;
		isInstallable.value = true;
		if (!isInstalled.value && !hasActiveDismissal()) {
			showInstallBadge.value = true;
		}
	};

	const handleAppInstalled = () => {
		deferredPrompt.value = null;
		updateInstalledState();
	};

	const handleVisibilityChange = () => {
		if (document.visibilityState === "visible") {
			updateInstalledState();
		}
	};

	onMounted(() => {
		if (updateInstalledState()) {
			return;
		}

		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		window.addEventListener("appinstalled", handleAppInstalled);
		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", handleVisibilityChange);
		}
	});

	onUnmounted(() => {
		window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		window.removeEventListener("appinstalled", handleAppInstalled);
		if (typeof document !== "undefined") {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		}
	});

	const promptInstall = async () => {
		if (!deferredPrompt.value) {
			return false;
		}

		deferredPrompt.value.prompt();
		const { outcome } = await deferredPrompt.value.userChoice;
		deferredPrompt.value = null;
		isInstallable.value = false;
		if (outcome === "accepted") {
			showInstallBadge.value = false;
			updateInstalledState();
			return true;
		}

		showInstallBadge.value = false;
		return false;
	};

	const dismissBadge = () => {
		showInstallBadge.value = false;
	};

	const snoozeBadge = () => {
		showInstallBadge.value = false;
		if (!isClient()) return;
		try {
			localStorage.setItem(DISMISS_KEY, new Date().toISOString());
		} catch (error) {
			console.warn("[PWA] Failed to snooze install badge", error);
		}
	};

	return {
		isInstallable,
		isInstalled,
		showInstallBadge,
		promptInstall,
		dismissBadge,
		snoozeBadge,
	};
}

//// Neoffice — the « Install the app » entry of the user's menu (kitchen test, 01.11): offered whenever the app is not installed and the browser sent its invitation, or the
//// device is a phone or a tablet (whose browser installs from its own menu: the entry then says where).
const MOBILE_BROWSER = /Android|iPhone|iPad|iPod|Mobile/i;

export function useInstallEntry() {
	const { isInstallable, promptInstall } = usePWAInstall();
	const installed = ref(isStandaloneDisplay());
	const canInstall = computed(
		() =>
			!installed.value &&
			(isInstallable.value ||
				(isClient() && MOBILE_BROWSER.test(window.navigator.userAgent || "")))
	);

	/** @returns {Promise<{done: boolean}|{manual: true}>} `manual`: the browser sent no invitation, the way by hand is to be shown */
	const install = async () => {
		if (!isInstallable.value) return { manual: true };
		return { done: await promptInstall() };
	};

	return { canInstall, install };
}

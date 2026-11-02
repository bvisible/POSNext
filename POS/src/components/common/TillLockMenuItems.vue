<!-- //// Neoffice — added file (no upstream equivalent). The entries of the user's avatar menu that belong to the lock of the till
     (NeoResto lot 1, product owner, 01.11.2026): "Lock" (at once, whatever the auto-lock setting says), "Set my till code" and, for
     a user who has one, "Remove my code". They sit in the menu's slot; the dialog they open (TillCodeDialog) is mounted by the page
     OUTSIDE the menu, because the menu closes, and takes its slot with it, on every click. -->
<template>
	<button
		type="button"
		data-test="lock-the-till"
		@click="lockNow()"
		class="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-amber-50 flex items-center gap-3 transition-colors"
	>
		<svg
			class="w-5 h-5 text-amber-600"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
			/>
		</svg>
		<span>{{ __("Lock") }}</span>
	</button>
	<button
		type="button"
		data-test="set-till-code"
		@click="openDialog('set')"
		class="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-amber-50 flex items-center gap-3 transition-colors"
	>
		<svg
			class="w-5 h-5 text-amber-600"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
			/>
		</svg>
		<span>{{ __("Set my till code") }}</span>
	</button>
	<button
		v-if="hasCode"
		type="button"
		data-test="remove-till-code"
		@click="openDialog('remove')"
		class="w-full text-start px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
	>
		<svg
			class="w-5 h-5 text-gray-500"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M6 18L18 6M6 6l12 12"
			/>
		</svg>
		<span>{{ __("Remove my code") }}</span>
	</button>
</template>

<script setup>
import { onMounted } from "vue";
import { useSessionLock } from "@/composables/useSessionLock";
import { useTillCode } from "@/composables/useTillCode";

const { lockNow } = useSessionLock();
const { hasCode, openDialog, refresh } = useTillCode();

// The menu is drawn when it opens: ask the server whether the user has a code now (offline, the device keeps what it knew)
onMounted(refresh);
</script>

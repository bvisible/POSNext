<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Header of the customer-facing second -->
	<!-- //// screen: instance logo, session and POS profile, connection state, so the buyer can -->
	<!-- //// see which till the screen is following and that it is still live. Upstream POSNext -->
	<!-- //// has no customer display. (185c3c50, 2026-02-03; c9d9c1cb, 2026-03-20 "align POS -->
	<!-- //// design with Neoffice theme and improve customer display") -->
	<header class="neo-glass border-b border-white/30 px-6 py-3">
		<div class="flex items-center justify-between">
			<!-- Left: Logo and session info -->
			<div class="flex items-center gap-4">
				<img
					:src="instanceLogo"
					alt="Neoffice"
					class="h-7 w-auto"
				/>
				<div class="h-5 w-px bg-gray-300"></div>
				<!-- Session info -->
				<div v-if="displayStore.sessionInfo" class="flex items-center gap-3 text-sm text-gray-600">
					<span class="px-3 py-1 bg-white/60 border border-gray-200 rounded-neo-sm font-medium">
						{{ displayStore.sessionInfo.pos_profile }}
					</span>
					<span v-if="displayStore.cartData.customer_name" class="flex items-center gap-1.5 font-medium text-gray-700">
						<FeatherIcon name="user" class="w-4 h-4 text-blue-500" />
						{{ displayStore.cartData.customer_name }}
					</span>
				</div>
			</div>

			<!-- Right: Connection status and actions -->
			<div class="flex items-center gap-3">
				<!-- Connection status -->
				<div class="flex items-center gap-2 px-3 py-1.5 rounded-neo-sm" :class="connectionBgClass">
					<span
						:class="[
							'w-2 h-2 rounded-full',
							connectionStatusClass
						]"
					/>
					<span class="text-xs font-medium" :class="connectionTextClass">{{ connectionStatusText }}</span>
				</div>

				<!-- Last update time -->
				<div v-if="displayStore.lastUpdateTime" class="text-xs text-gray-400">
					{{ formatTime(displayStore.lastUpdateTime) }}
				</div>

				<!-- Refresh button -->
				<button
					class="p-2 text-gray-500 hover:text-gray-900 hover:bg-white/60 rounded-neo-sm transition-colors"
					:title="__('Refresh')"
					@click="displayStore.refreshCart()"
				>
					<FeatherIcon name="refresh-cw" class="w-4 h-4" />
				</button>

				<!-- Settings/Logout -->
				<div class="relative">
					<button
						class="p-2 text-gray-500 hover:text-gray-900 hover:bg-white/60 rounded-neo-sm transition-colors"
						@click="showMenu = !showMenu"
					>
						<FeatherIcon name="more-vertical" class="w-4 h-4" />
					</button>

					<!-- Dropdown menu -->
					<transition
						enter-active-class="transition-all duration-150"
						leave-active-class="transition-all duration-150"
						enter-from-class="opacity-0 scale-95"
						leave-to-class="opacity-0 scale-95"
					>
						<div
							v-if="showMenu"
							class="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-neo-md shadow-neo-lg z-50"
						>
							<div class="py-1">
								<button
									class="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-neo-sm mx-1"
									style="width: calc(100% - 8px)"
									@click="handleLogout"
								>
									<FeatherIcon name="log-out" class="w-4 h-4 text-red-500" />
									{{ __("Disconnect") }}
								</button>
							</div>
						</div>
					</transition>
				</div>
			</div>
		</div>
	</header>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
import { computed, ref, onMounted, onUnmounted } from "vue"
import { useCustomerDisplayStore } from "@/stores/customerDisplay"

const displayStore = useCustomerDisplayStore()
const instanceLogo = "/files/logo-default.png"

const showMenu = ref(false)

// Connection status styling
const connectionStatusClass = computed(() => {
	switch (displayStore.connectionStatus) {
		case "connected":
			return "bg-green-500"
		case "polling":
			return "bg-yellow-500 animate-pulse"
		case "error":
			return "bg-red-500"
		case "connecting":
			return "bg-blue-500 animate-pulse"
		default:
			return "bg-gray-500"
	}
})

const connectionBgClass = computed(() => {
	switch (displayStore.connectionStatus) {
		case "connected":
			return "bg-green-50 border border-green-200"
		case "error":
			return "bg-red-50 border border-red-200"
		default:
			return "bg-gray-50 border border-gray-200"
	}
})

const connectionTextClass = computed(() => {
	switch (displayStore.connectionStatus) {
		case "connected":
			return "text-green-700"
		case "error":
			return "text-red-700"
		default:
			return "text-gray-600"
	}
})

const connectionStatusText = computed(() => {
	switch (displayStore.connectionStatus) {
		case "connected":
			return __("Connected")
		case "polling":
			return __("Polling")
		case "error":
			return __("Connection Error")
		case "connecting":
			return __("Connecting...")
		default:
			return __("Disconnected")
	}
})

// Format time
function formatTime(date) {
	if (!date) return ""
	return new Date(date).toLocaleTimeString("fr-FR", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	})
}

// Handle logout
function handleLogout() {
	showMenu.value = false
	displayStore.logout()
}

// Close menu on click outside
function handleClickOutside(event) {
	if (showMenu.value && !event.target.closest(".relative")) {
		showMenu.value = false
	}
}

onMounted(() => {
	document.addEventListener("click", handleClickOutside)
})

onUnmounted(() => {
	document.removeEventListener("click", handleClickOutside)
})
</script>

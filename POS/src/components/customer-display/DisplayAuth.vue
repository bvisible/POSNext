<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Pairing screen of the customer-facing -->
	<!-- //// second screen. That display is a separate browser window with no cashier session, so -->
	<!-- //// it authenticates with the display password alone before it may mirror any cart. -->
	<!-- //// Upstream POSNext has no second screen. (185c3c50, 2026-02-03; c9d9c1cb, 2026-03-20 -->
	<!-- //// aligns it with the Neoffice theme and the instance logo; 771950bd renames the -->
	<!-- //// product to Neopos.) -->
	<div class="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-8">
		<div class="max-w-md w-full space-y-8">
			<!-- Logo/Header -->
			<div class="text-center">
				<FeatherIcon name="monitor" class="w-20 h-20 mx-auto text-blue-600 dark:text-blue-400 mb-4" />
				<h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ __("Customer Display") }}</h1>
				<p class="mt-2 text-gray-600 dark:text-gray-400">{{ __("Enter the connection password") }}</p>
			</div>

			<!-- Auth form -->
			<div class="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-2xl">
				<form class="space-y-6" @submit.prevent="handleSubmit">
					<!-- Error message -->
					<div v-if="displayStore.authError" class="p-4 bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 rounded-lg">
						<div class="flex items-start gap-3">
							<FeatherIcon name="alert-circle" class="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
							<p class="text-red-700 dark:text-red-300 text-sm">{{ displayStore.authError }}</p>
						</div>
					</div>

					<!-- Password input -->
					<div class="space-y-2">
						<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
							{{ __("Password") }}
						</label>
						<div class="relative">
							<input
								v-model="password"
								:type="showPassword ? 'text' : 'password'"
								:placeholder="__('Enter the connection password')"
								class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								:disabled="displayStore.isLoading"
								required
								autofocus
							/>
							<button
								type="button"
								class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
								@click="showPassword = !showPassword"
							>
								<FeatherIcon :name="showPassword ? 'eye-off' : 'eye'" class="w-5 h-5" />
							</button>
						</div>
					</div>

					<!-- Help text -->
					<div class="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
						<div class="flex items-start gap-3">
							<FeatherIcon name="info" class="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
							<div class="text-xs text-blue-700 dark:text-blue-300">
								<p class="font-medium mb-1">{{ __("Where to find the password?") }}</p>
								<!-- //// Neoffice — the display's own password (maintenance#2296, audit Q2): drawn by a till manager at the till, no longer the client's API password -->
								<p>{{ __("A till manager draws it at the till: Settings, General tab, Customer display, New display password.") }}</p>
							</div>
						</div>
					</div>

					<!-- Submit button -->
					<button
						type="submit"
						:disabled="displayStore.isLoading || !password"
						class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2"
					>
						<FeatherIcon
							v-if="displayStore.isLoading"
							name="loader"
							class="w-5 h-5 animate-spin"
						/>
						<span>{{ displayStore.isLoading ? __("Connecting...") : __("Connect") }}</span>
					</button>
				</form>
			</div>

			<!-- Footer -->
			<p class="text-center text-gray-500 text-sm">
				{{ __("Neopos Customer Display") }}
			</p>
		</div>
	</div>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
import { ref } from "vue"
import { useCustomerDisplayStore } from "@/stores/customerDisplay"

//// Neoffice — the display pairs with the password of its own account (maintenance#2296, audit Q2). It built the key of
//// the client's super account from a key half written here, the same on every site, and the client's API password.
const displayStore = useCustomerDisplayStore()

const password = ref("")
const showPassword = ref(false)

async function handleSubmit() {
	if (!password.value) return

	const success = await displayStore.pair(password.value)
	if (success) {
		password.value = ""
	}
}
</script>

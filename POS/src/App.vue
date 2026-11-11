<!-- //// Neoffice — this BVISIBLE-FORK header is itself part of the divergence: -->
<!-- //// scripts/annotate_fork.py wrote it in May 2026 (4e0d3068) and it is kept only for -->
<!-- //// the sha7 index it carries. The real change in this file is the NoraLearn React -->
<!-- //// island mounted below (05053a5b, 2026-04-07 "integrate nora-learn-react via React -->
<!-- //// Island bridge"), which has no upstream equivalent. -->
<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// integrate nora-learn-react via React Island bridge — 05053a5
-->
<template>
	<div class="flex flex-1 flex-col min-h-0">
		<router-view :key="translationVersion" />
		<Toast />
		<!-- //// Neoffice — NoraLearn (our in-app guidance) is a React app; this bridge -->
		<!-- //// mounts a React root in document.body and renders through createPortal, -->
		<!-- //// outside the Vue tree, so the two frameworks never fight over the same -->
		<!-- //// nodes. No upstream equivalent (05053a5b, 2026-04-07 "integrate -->
		<!-- //// nora-learn-react via React Island bridge"). -->
		<!-- //// Neoffice — not on a page a visitor opens with no account (the QR menu, the takeaway order, the scan in the shop, the -->
		<!-- //// booking, the customer display) nor on the login page: the bridge asks Nora for the tutorials of a user, which a visitor -->
		<!-- //// is refused (a 403 at each load, maintenance#1975), and a customer is shown no staff training. -->
		<NoraLearnBridge v-if="staffScreen" />
		<AuthorizationDialog />
	</div>
</template>

<script setup>
import AuthorizationDialog from "@/components/common/AuthorizationDialog.vue";
import Toast from "@/components/common/Toast.vue";
//// Neoffice — import for the React-island bridge above (05053a5b, 2026-04-07
//// "integrate nora-learn-react via React Island bridge").
import NoraLearnBridge from "@/components/common/NoraLearnBridge.vue";
import { translationVersion } from "@/utils/translation";
//// Neoffice — the words of a tab's title are translated when it is written, and the catalogue of translations may arrive
//// after the first navigation: the title is written again whenever it changes, as the page is (the key of the router-view).
import { computed, watch } from "vue";
import { refreshTabTitle } from "@/utils/tabTitle";
//// Neoffice — the screens of the staff, where the tutorials are mounted (maintenance#1975): a route the router has resolved (before the
//// first navigation the route matches nothing and says nothing of its visitors), which is neither open to a visitor nor the login page.
import { useRoute } from "vue-router";
watch(translationVersion, refreshTabTitle);
const route = useRoute();
const staffScreen = computed(
	() => route.matched.length > 0 && !route.meta?.allowGuest && route.name !== "Login",
);
</script>

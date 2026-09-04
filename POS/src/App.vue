<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// integrate nora-learn-react via React Island bridge — 05053a5
-->
<template>
  <div>
    <router-view :key="translationVersion" />
    <Toast />
    <!-- //// Neoffice — NoraLearn (our in-app guidance) is a React app; this bridge -->
    <!-- //// mounts a React root in document.body and renders through createPortal, -->
    <!-- //// outside the Vue tree, so the two frameworks never fight over the same -->
    <!-- //// nodes. No upstream equivalent (05053a5b, 2026-04-07 "integrate -->
    <!-- //// nora-learn-react via React Island bridge"). -->
    <NoraLearnBridge />
  </div>
</template>

<script setup>
import Toast from "@/components/common/Toast.vue"
//// Neoffice — import for the React-island bridge above (05053a5b, 2026-04-07
//// "integrate nora-learn-react via React Island bridge").
import NoraLearnBridge from "@/components/common/NoraLearnBridge.vue"
import { translationVersion } from "@/utils/translation"
</script>

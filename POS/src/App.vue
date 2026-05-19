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
    <NoraLearnBridge />
  </div>
</template>

<script setup>
import Toast from "@/components/common/Toast.vue"
import NoraLearnBridge from "@/components/common/NoraLearnBridge.vue"
import { translationVersion } from "@/utils/translation"
</script>

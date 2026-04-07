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

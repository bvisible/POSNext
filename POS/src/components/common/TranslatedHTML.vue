<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
-->
<template>
    <component :is="tag" :="$attrs" ref="containerRef">
    </component>
</template>

<script setup>
//// Neoffice — formatting only, no behaviour change: the fork ran Biome over the whole POS
//// source (458d81a9, 2026-03-20 "remove BrainWise branding, add restaurant mode, and code
//// formatting"). Upstream is equivalent — re-run the formatter at the next merge.
import { ref, onMounted } from "vue"
import DOMPurify from "dompurify"

const props = defineProps({
	//// Neoffice — Biome quote style and trailing commas only, no behaviour change (458d81a9).
	tag: {
		type: String,
		required: false,
		default: "span",
	},
	inner: {
		type: String,
		required: true,
	},
})

const containerRef = ref(null)

onMounted(() => {
	//// Neoffice — indentation only: Biome re-indented this file from spaces to tabs (458d81a9,
	//// 2026-03-20). `git blame -w` reports no author here precisely because nothing but the
	//// whitespace changed; the DOMPurify sanitising is upstream's.
	const sanitized = DOMPurify.sanitize(props.inner)
	containerRef.value.innerHTML = sanitized
})
</script>
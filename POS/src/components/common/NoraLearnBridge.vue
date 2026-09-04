<template>
  <!-- //// Neoffice — added file (no upstream equivalent). React island that mounts -->
  <!-- //// nora-learn-react (Neoffice's in-product training: popup, sidebar, session system) -->
  <!-- //// inside the Vue POS. It lazily creates a React root on document.body and renders -->
  <!-- //// through createPortal, so nothing React ever touches the Vue tree. Upstream POSNext -->
  <!-- //// has no training surface. (05053a5b, 2026-04-07 "integrate nora-learn-react via -->
  <!-- //// React Island bridge") -->
  <div />
</template>

<script setup>
/**
 * React Island bridge — mounts nora-learn-react inside the Vue app.
 * All React rendering uses createPortal to document.body (outside Vue tree).
 */
import { onMounted, onUnmounted, watch } from "vue"
import { useRouter } from "vue-router"
import { useToast } from "@/composables/useToast"

let reactRoot = null
let mountDiv = null

const router = useRouter()
const { showSuccess, showError, showWarning, showInfo } = useToast()

onMounted(async () => {
  try {
    const [React, ReactDOM, NoraLearn] = await Promise.all([
      import("react"),
      import("react-dom/client"),
      import("@neoffice/nora-learn-react"),
    ])

    // Import styles
    await import("@neoffice/nora-learn-react/styles")

    // Ensure frappe.boot.nora_learns is accessible
    if (!window.frappe) window.frappe = {}
    if (!window.frappe.boot) window.frappe.boot = {}
    if (!window.frappe.boot.nora_learns && window.nora_learns) {
      window.frappe.boot.nora_learns = window.nora_learns
    }

    // If boot data not available, fetch from API
    if (!window.frappe.boot.nora_learns) {
      try {
        const res = await fetch("/api/method/nora.api.learn_engine.get_available_learns", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Frappe-CSRF-Token": window.csrf_token,
          },
        })
        const data = await res.json()
        window.frappe.boot.nora_learns = data.message?.learns || []
      } catch {
        window.frappe.boot.nora_learns = []
      }
    }

    // Create mount point outside Vue tree
    mountDiv = document.createElement("div")
    mountDiv.id = "nora-learn-react-root"
    mountDiv.setAttribute("data-nora-ignore", "true")
    document.body.appendChild(mountDiv)

    // Create React root and render
    reactRoot = ReactDOM.createRoot(mountDiv)

    const config = {
      appName: "posnext",
      navigate: (url) => {
        // POS routes start with /pos
        if (url.startsWith("/pos")) {
          router.push(url.replace("/pos", "") || "/")
        } else {
          window.location.href = url
        }
      },
      getCurrentRoute: () => "/pos" + (router.currentRoute.value.fullPath || "/"),
      showAlert: (message, variant) => {
        const methods = { success: showSuccess, error: showError, warning: showWarning, info: showInfo }
        const fn = methods[variant] || showInfo
        fn(message)
      },
      csrfToken: window.csrf_token,
      noraIconUrl: "/assets/nora/images/nora_icon.svg",
    }

    reactRoot.render(
      React.createElement(NoraLearn.NoraLearnProvider, { config })
    )
  } catch (err) {
    console.warn("[NoraLearnBridge] Failed to initialize:", err)
  }
})

onUnmounted(() => {
  if (reactRoot) {
    reactRoot.unmount()
    reactRoot = null
  }
  if (mountDiv) {
    mountDiv.remove()
    mountDiv = null
  }
})
</script>

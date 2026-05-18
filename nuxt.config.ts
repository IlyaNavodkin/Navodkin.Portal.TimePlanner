import { defineNuxtConfig } from "nuxt/config"

export default defineNuxtConfig({
  compatibilityDate: "2026-05-15",
  modules: ["@nuxt/ui"],
  css: ["~/assets/css/main.css"],
  typescript: {
    strict: true,
  },
  runtimeConfig: {
    providerMode: process.env.PROVIDER_MODE ?? "mock",
    providerBaseUrl: process.env.PROVIDER_BASE_URL ?? "http://localhost:4000",
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? "/api",
    },
  },
})

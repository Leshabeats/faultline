/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FAULTLINE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

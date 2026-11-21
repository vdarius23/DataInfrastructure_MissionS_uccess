/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API. Empty (default) = same origin, proxied by nginx or Vite. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

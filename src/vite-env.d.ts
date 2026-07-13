/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AWS_REGION: string;
  readonly VITE_USER_POOL_ID: string;
  readonly VITE_USER_POOL_CLIENT_ID: string;
  readonly VITE_COGNITO_DOMAIN: string;
  readonly VITE_API_BASE: string;
  readonly VITE_WS_URL: string;
  readonly VITE_ENABLE_GOOGLE: string;
  readonly VITE_BERTH_IMAGE?: string;
  readonly VITE_PIEZO_FREQ_SLACK_HZ?: string;
  readonly VITE_PIEZO_FREQ_CRIT_HZ?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

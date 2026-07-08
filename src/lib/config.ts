export const config = {
  region: import.meta.env.VITE_AWS_REGION,
  userPoolId: import.meta.env.VITE_USER_POOL_ID,
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
  cognitoDomain: import.meta.env.VITE_COGNITO_DOMAIN,
  apiBase: import.meta.env.VITE_API_BASE,
  wsUrl: import.meta.env.VITE_WS_URL,
  enableGoogle: import.meta.env.VITE_ENABLE_GOOGLE === "true",
  // Optional berth-plan background image (e.g. "/berth-plan.png" in public/).
  // Empty -> a clean neutral base is drawn instead.
  berthImage: import.meta.env.VITE_BERTH_IMAGE ?? "",
};

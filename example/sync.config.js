export const SYNC_CONFIG = {
  // Set `enabled` to `true` to enable sync.
  enabled: Boolean(process.env.TEMPLATE_SYNC_ENABLED) || false,
  // Add your Realm App ID here if sync is enabled.
  appId: process.env.TEMPLATE_APP_ID || '<Your App ID>',
};

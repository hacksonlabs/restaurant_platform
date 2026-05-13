const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function text(value: string | undefined, fallback = ""): string {
  return value?.trim() || fallback;
}

function bool(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

export interface AppEnv {
  port: number;
  appUrl: string;
  demoMode: boolean;
  databaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  supabaseDbPassword: string;
  posMode: "mock" | "live";
  toastEnv: "sandbox" | "production";
  toastBaseUrl: string;
  toastClientId: string;
  toastClientSecret: string;
  toastRestaurantGuid: string;
  toastLocationId: string;
  toastManagementGroupGuid: string;
  toastAccessToken: string;
  toastWebhookSecret: string;
  deliverectBaseUrl: string;
  deliverectClientId: string;
  deliverectClientSecret: string;
  deliverectAccessToken: string;
  deliverectAccountId: string;
  deliverectStoreId: string;
  deliverectChannelLinkId: string;
  deliverectWebhookSecret: string;
  demoPhantomApiKey: string;
  restaurantAuthEmail: string;
  restaurantAuthPassword: string;
  restaurantAuthSecret: string;
  restaurantAuthRestaurantId: string;
}

export function getEnv(): AppEnv {
  return {
    port: Number.parseInt(process.env.PORT ?? "3030", 10),
    appUrl: text(process.env.VITE_APP_URL, "http://localhost:5173"),
    demoMode: bool(process.env.DEMO_MODE, true),
    databaseUrl: text(process.env.DATABASE_URL),
    supabaseUrl: text(process.env.SUPABASE_URL),
    supabaseAnonKey: text(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY),
    supabaseServiceRoleKey: text(
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE,
    ),
    supabaseDbPassword: text(process.env.SUPABASE_DB_PASSWORD),
    posMode: text(process.env.POS_MODE, "mock") === "live" ? "live" : "mock",
    toastEnv: text(process.env.TOAST_ENV, "sandbox") === "production" ? "production" : "sandbox",
    toastBaseUrl: text(process.env.TOAST_BASE_URL),
    toastClientId: text(process.env.TOAST_CLIENT_ID),
    toastClientSecret: text(process.env.TOAST_CLIENT_SECRET),
    toastRestaurantGuid: text(process.env.TOAST_RESTAURANT_GUID, "toast-rest-guid-lb-steakhouse"),
    toastLocationId: text(process.env.TOAST_LOCATION_ID),
    toastManagementGroupGuid: text(process.env.TOAST_MANAGEMENT_GROUP_GUID),
    toastAccessToken: text(process.env.TOAST_ACCESS_TOKEN),
    toastWebhookSecret: text(process.env.TOAST_WEBHOOK_SECRET),
    deliverectBaseUrl: text(process.env.DELIVERECT_BASE_URL, "https://api.staging.deliverect.com"),
    deliverectClientId: text(process.env.DELIVERECT_CLIENT_ID),
    deliverectClientSecret: text(process.env.DELIVERECT_CLIENT_SECRET),
    deliverectAccessToken: text(process.env.DELIVERECT_ACCESS_TOKEN),
    deliverectAccountId: text(process.env.DELIVERECT_ACCOUNT_ID),
    deliverectStoreId: text(process.env.DELIVERECT_STORE_ID),
    deliverectChannelLinkId: text(process.env.DELIVERECT_CHANNEL_LINK_ID),
    deliverectWebhookSecret: text(process.env.DELIVERECT_WEBHOOK_SECRET),
    demoPhantomApiKey: text(process.env.DEMO_PHANTOM_API_KEY, "coachimhungry_demo_live_local_key"),
    restaurantAuthEmail: text(process.env.RESTAURANT_AUTH_EMAIL, "dev@rest.com"),
    restaurantAuthPassword: text(process.env.RESTAURANT_AUTH_PASSWORD, "password"),
    restaurantAuthSecret: text(process.env.RESTAURANT_AUTH_SECRET, "phantom_restaurant_auth_dev_secret"),
    restaurantAuthRestaurantId: text(process.env.RESTAURANT_AUTH_RESTAURANT_ID, "rest_lb_steakhouse"),
  };
}

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The app does not use ISR. Account data and research quotas stay in Supabase.
export default defineCloudflareConfig();

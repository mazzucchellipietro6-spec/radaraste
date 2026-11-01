/// <reference types="astro/client" />
import type { CurrentUser, Profile } from '~/lib/server/auth';

declare global {
  namespace App {
    interface Locals {
      admin?: { user: CurrentUser; profile: Profile };
    }
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  readonly PUBLIC_PLAUSIBLE_DOMAIN?: string;
  readonly PUBLIC_PLAUSIBLE_SRC?: string;
  readonly PUBLIC_GA4_ID?: string;
  readonly KEYSTATIC_ENABLED?: boolean;
}

export {};

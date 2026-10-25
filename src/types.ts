import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { EmailBinding } from './mail.js';
export interface Env {
  DB: D1Database;
  BOOKS: R2Bucket;
  OAUTH_KV: KVNamespace;
  AUTH_RATE_LIMIT: RateLimit;
  ASSETS: Fetcher;
  EMAIL: EmailBinding;
  ORIGIN: string;
  SENDER: string;
  AUTH_SECRET: string;
  SIGNING_SECRET: string;
  FILE_ORIGINS?: string;
  OAUTH_PROVIDER: OAuthHelpers;
}
export interface User {
  id: string;
  name: string;
  destination: string | null;
  destination_version: string;
  disabled: number;
  created_at: number;
  default_destination_id: string | null;
}
export interface ReaderDestination {
  id: string;
  owner: string;
  label: string;
  email: string;
  confirmed_at: number | null;
}
export interface Artifact {
  id: string;
  owner: string;
  kind: 'document' | 'image';
  filename: string;
  type: string;
  sha256: string;
  bytes: number;
  object_key: string;
  generated: number;
  created_at: number;
  expires_at: number;
}
export interface Delivery {
  id: string;
  owner: string;
  send_key: string;
  purpose: 'document' | 'challenge';
  artifact_id: string | null;
  sha256: string;
  destination_hash: string;
  destination_mask: string;
  destination_id?: string | null;
  default_intent_key?: string | null;
  state: 'submitting' | 'submitted' | 'rejected' | 'unknown';
  provider_id: string | null;
  error_code: string | null;
  resend_of: string | null;
  created_at: number;
  updated_at: number;
}
export interface Challenge {
  owner: string;
  destination: string;
  generation: string;
  code_hash: string;
  attempts: number;
  expires_at: number;
  label: string;
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{
    success: boolean;
    reset?: number;
    remaining?: number;
    limit?: number;
  }>;
}

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface DurableObjectStubLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  FRONTEND_URL?: string;
  AUTH_RATE_LIMITER?: RateLimitBinding;
  API_RATE_LIMITER?: RateLimitBinding;
  SYNC_RATE_LIMITER?: RateLimitBinding;
  VERIFY_RATE_LIMITER?: RateLimitBinding;
  GEOCODE_RATE_LIMITER?: RateLimitBinding;
  /** Wide per-IP ceiling applied on top of every identity-keyed limiter, so a
   * forged `sub` cannot sidestep rate limiting. See middleware/rateLimiter.ts. */
  IP_RATE_LIMITER?: RateLimitBinding;
  GEOCODE_CACHE?: KVNamespaceLike;
  SSE_HUB?: DurableObjectNamespaceLike;
}

export type Variables = {
  userId: string;
  userEmail: string | null;
  preferredRoleId?: number;
  supervisorOfficerId?: number;
  roleId?: number;
  adminProfileId?: number;
};

export type AppEnv = {
  Bindings: Env;
  Variables: Variables;
};

export type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
};

const SEEDED_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FRONTEND_URL'] as const;

export function seedEnv(env: Partial<Env> | undefined): void {
  if (!env) return;
  for (const key of SEEDED_KEYS) {
    const value = env[key];
    if (typeof value === 'string' && value.length > 0) {
      process.env[key] = value;
    }
  }
}

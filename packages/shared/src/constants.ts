const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export const MAX_USERS_PER_TENANT = 3;
export const MAX_ENDPOINTS_PER_TENANT = 20;

export const SESSION_COOKIE_NAME = "hr_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const INVITATION_TTL_DAYS = 7;

export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 100;

export const MAX_PAYLOAD_BYTES = 256 * 1024;

export const DEFAULT_MAX_ATTEMPTS = 8;
export const MAX_ATTEMPTS_LIMIT = 20;

export const REQUEST_TIMEOUT_MS = 15 * SECOND_MS;
export const RESPONSE_SNIPPET_BYTES = 1024;

export const BACKOFF_BASE_MS = 30 * SECOND_MS;
export const BACKOFF_FACTOR = 4;
export const BACKOFF_CAP_MS = 6 * HOUR_MS;

export const BREAKER_FAILURE_THRESHOLD = 5;
export const BREAKER_BASE_COOLDOWN_MS = 30 * SECOND_MS;
export const BREAKER_MAX_COOLDOWN_MS = 10 * MINUTE_MS;

export const AUTO_DISABLE_THRESHOLD = 50;

export const SWEEP_INTERVAL_MS = 30 * SECOND_MS;
export const SWEEP_GRACE_MS = 60 * SECOND_MS;
export const SWEEP_BATCH_SIZE = 500;

export const MAX_CUSTOM_HEADERS = 10;
export const SIGNATURE_TOLERANCE_SEC = 300;

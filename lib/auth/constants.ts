export const PASSWORD_MIN_LENGTH = 12;

export const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
  version: 1,
};

export const AUTH_COOKIE_NAME = "fitness_session";
export const SESSION_ABSOLUTE_LIFETIME_SECONDS = 8 * 60 * 60;
export const SESSION_IDLE_TIMEOUT_SECONDS = 30 * 60;
export const SESSION_TOUCH_INTERVAL_SECONDS = 5 * 60;

export const ACCOUNT_LOGIN_LIMIT = 5;
export const IP_LOGIN_LIMIT = 20;
export const LOGIN_LIMIT_WINDOW_SECONDS = 15 * 60;
export const LOGIN_LIMIT_LOCK_SECONDS = 15 * 60;

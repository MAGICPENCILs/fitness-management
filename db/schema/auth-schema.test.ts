import { describe, expect, it } from "vitest";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "./index";

const schemaContract = schema as Record<string, unknown>;

describe("authentication schema contract", () => {
  it("defines the session storage contract", () => {
    const authSessions = schemaContract.authSessions as MySqlTable | undefined;

    expect(authSessions).toBeDefined();
    if (!authSessions) return;

    const config = getTableConfig(authSessions);
    const mode = config.columns.find((column) => column.name === "mode");
    const revokedReason = config.columns.find(
      (column) => column.name === "revoked_reason",
    );

    expect(config.name).toBe("auth_sessions");
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "staff_id",
        "session_token_hash",
        "mode",
        "created_at",
        "last_seen_at",
        "absolute_expires_at",
        "idle_expires_at",
        "revoked_at",
        "revoked_reason",
        "ip_fingerprint",
        "user_agent_category",
      ]),
    );
    expect(mode?.enumValues).toEqual([
      "FULL",
      "PASSWORD_CHANGE_REQUIRED",
    ]);
    expect(revokedReason?.enumValues).toEqual([
      "LOGOUT",
      "PASSWORD_CHANGED",
      "PASSWORD_RESET",
      "STAFF_UPDATED",
      "ADMIN_REVOKED",
      "EXPIRED",
    ]);
    expect(config.uniqueConstraints.map((item) => item.name)).toContain(
      "auth_session_token_hash_unique",
    );
    expect(config.indexes.map((item) => item.config.name)).toContain(
      "auth_session_staff_status_expiry_idx",
    );
  });

  it("defines the persistent login-limit contract", () => {
    const authLoginLimits = schemaContract.authLoginLimits as
      | MySqlTable
      | undefined;

    expect(authLoginLimits).toBeDefined();
    if (!authLoginLimits) return;

    const config = getTableConfig(authLoginLimits);
    const scope = config.columns.find((column) => column.name === "scope");

    expect(config.name).toBe("auth_login_limits");
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "id",
        "scope",
        "subject_hash",
        "attempt_count",
        "window_started_at",
        "locked_until",
        "updated_at",
      ]),
    );
    expect(scope?.enumValues).toEqual(["ACCOUNT", "IP"]);
    expect(config.uniqueConstraints.map((item) => item.name)).toContain(
      "auth_limit_scope_subject_unique",
    );
    expect(config.indexes.map((item) => item.config.name)).toContain(
      "auth_limit_scope_locked_until_idx",
    );
  });

  it("adds password lifecycle fields to staff without breaking legacy rows", () => {
    const config = getTableConfig(schema.staff);
    const passwordHash = config.columns.find(
      (column) => column.name === "password_hash",
    );
    const passwordChangedAt = config.columns.find(
      (column) => column.name === "password_changed_at",
    );
    const mustChangePassword = config.columns.find(
      (column) => column.name === "must_change_password",
    );

    expect(passwordHash?.notNull).toBe(false);
    expect(passwordChangedAt?.notNull).toBe(false);
    expect(mustChangePassword).toMatchObject({ notNull: true, default: true });
  });

  it("allows audit events before a staff identity or branch is known", () => {
    const config = getTableConfig(schema.auditLogs);

    expect(
      config.columns.find((column) => column.name === "actor_staff_id")
        ?.notNull,
    ).toBe(false);
    expect(
      config.columns.find((column) => column.name === "branch_id")?.notNull,
    ).toBe(false);
    expect(config.indexes.map((item) => item.config.name)).toEqual(
      expect.arrayContaining([
        "audit_branch_created_idx",
        "audit_actor_created_idx",
      ]),
    );
  });
});

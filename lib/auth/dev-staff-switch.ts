import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { authSessions, branches, staff } from "@/db/schema";
import { writeAudit } from "@/lib/audit-service";
import {
  SESSION_ABSOLUTE_LIFETIME_SECONDS,
  SESSION_IDLE_TIMEOUT_SECONDS,
} from "@/lib/auth/constants";
import {
  createSessionId,
  hashSessionId,
  signSessionClaims,
} from "@/lib/auth/session-token";
import type {
  RequestFingerprintInput,
  SessionClaims,
} from "@/lib/auth/types";
import type { StaffRole } from "@/lib/rbac";

type CurrentDevSession = {
  authSessionId: number;
  staffId: number;
  homeBranchId: number;
};

type TargetStaff = {
  id: number;
  role: StaffRole;
  homeBranchId: number;
};

type RotateInput = {
  currentAuthSessionId: number;
  currentStaffId: number;
  currentBranchId: number;
  targetStaffId: number;
  occurredAt: Date;
  newSession: RequestFingerprintInput & {
    sessionTokenHash: string;
    mode: "FULL";
    createdAt: Date;
    lastSeenAt: Date;
    absoluteExpiresAt: Date;
    idleExpiresAt: Date;
  };
};

export interface DevStaffSwitchRepository {
  rotate(input: RotateInput): Promise<TargetStaff>;
}

export class DevStaffSwitchError extends Error {
  /** เก็บ HTTP status ที่ route ใช้ตอบข้อความกลาง โดยไม่เปิดเผยรายละเอียด session หรือบัญชี */
  constructor(message: string, public status: 401 | 404 | 409) {
    super(message);
    this.name = "DevStaffSwitchError";
  }
}

type DevStaffSwitchDependencies = {
  now: () => Date;
  createSessionId: () => string;
  hashSessionId: (sessionId: string) => string;
  signSessionClaims: (claims: SessionClaims) => Promise<string>;
};

/** สร้าง service ที่หมุน credential หลัง transaction สำเร็จเท่านั้น เพื่อไม่คืน cookie เมื่อ revoke/create/audit rollback */
export function createDevStaffSwitchService(
  repository: DevStaffSwitchRepository,
  dependencies: DevStaffSwitchDependencies,
) {
  async function rotate(
    current: CurrentDevSession,
    targetStaffId: number,
    request: RequestFingerprintInput,
  ) {
    const occurredAt = dependencies.now();
    const sessionId = dependencies.createSessionId();
    const absoluteExpiresAt = new Date(
      occurredAt.getTime() + SESSION_ABSOLUTE_LIFETIME_SECONDS * 1_000,
    );
    const idleExpiresAt = new Date(
      occurredAt.getTime() + SESSION_IDLE_TIMEOUT_SECONDS * 1_000,
    );
    const target = await repository.rotate({
      currentAuthSessionId: current.authSessionId,
      currentStaffId: current.staffId,
      currentBranchId: current.homeBranchId,
      targetStaffId,
      occurredAt,
      newSession: {
        sessionTokenHash: dependencies.hashSessionId(sessionId),
        mode: "FULL",
        createdAt: occurredAt,
        lastSeenAt: occurredAt,
        absoluteExpiresAt,
        idleExpiresAt,
        ...request,
      },
    });
    const claims: SessionClaims = {
      sessionId,
      staffId: target.id,
      role: target.role,
      homeBranchId: target.homeBranchId,
      mode: "FULL",
      expiresAt: Math.floor(absoluteExpiresAt.getTime() / 1_000),
    };
    return {
      claims,
      sessionCookie: await dependencies.signSessionClaims(claims),
    };
  }

  return { rotate };
}

export class DrizzleDevStaffSwitchRepository implements DevStaffSwitchRepository {
  /** ล็อก session และเป้าหมายก่อน CAS revoke แล้วสร้าง session/audit ใน transaction เดียว เพื่อปิด TOCTOU และ concurrent reuse */
  async rotate(input: RotateInput): Promise<TargetStaff> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          staffId: authSessions.staffId,
          mode: authSessions.mode,
          revokedAt: authSessions.revokedAt,
          absoluteExpiresAt: authSessions.absoluteExpiresAt,
          idleExpiresAt: authSessions.idleExpiresAt,
        })
        .from(authSessions)
        .where(eq(authSessions.id, input.currentAuthSessionId))
        .limit(1)
        .for("update");
      if (
        !current ||
        current.staffId !== input.currentStaffId ||
        current.mode !== "FULL" ||
        current.revokedAt ||
        current.absoluteExpiresAt.getTime() <= input.occurredAt.getTime() ||
        current.idleExpiresAt.getTime() <= input.occurredAt.getTime()
      ) {
        throw new DevStaffSwitchError("เซสชันไม่สามารถใช้งานได้", 401);
      }

      const [target] = await tx
        .select({
          id: staff.id,
          role: staff.role,
          homeBranchId: staff.homeBranchId,
          staffStatus: staff.status,
          branchStatus: branches.status,
        })
        .from(staff)
        .innerJoin(branches, eq(staff.homeBranchId, branches.id))
        .where(eq(staff.id, input.targetStaffId))
        .limit(1)
        .for("update");
      if (!target || target.staffStatus !== "ACTIVE" || target.branchStatus !== "ACTIVE") {
        throw new DevStaffSwitchError("ไม่พบบัญชีพนักงานที่เปิดใช้งาน", 404);
      }

      const revoked = await tx
        .update(authSessions)
        .set({
          revokedAt: input.occurredAt,
          revokedReason: "ADMIN_REVOKED",
        })
        .where(
          and(
            eq(authSessions.id, input.currentAuthSessionId),
            eq(authSessions.staffId, input.currentStaffId),
            isNull(authSessions.revokedAt),
            gt(authSessions.absoluteExpiresAt, input.occurredAt),
            gt(authSessions.idleExpiresAt, input.occurredAt),
          ),
        );
      if (revoked[0].affectedRows === 0) {
        throw new DevStaffSwitchError("เซสชันถูกเปลี่ยนแปลงแล้ว", 409);
      }

      await tx.insert(authSessions).values({
        staffId: target.id,
        ...input.newSession,
      });
      await writeAudit(tx, {
        actorStaffId: input.currentStaffId,
        branchId: input.currentBranchId,
        action: "DEV_STAFF_CONTEXT_CHANGED",
        entityType: "STAFF",
        entityId: target.id,
        result: "SUCCESS",
        metadata: {
          source: "DEV_STAFF_SWITCHER",
          branchId: target.homeBranchId,
        },
      });
      return {
        id: target.id,
        role: target.role,
        homeBranchId: target.homeBranchId,
      };
    });
  }
}

const defaultService = createDevStaffSwitchService(
  new DrizzleDevStaffSwitchRepository(),
  {
    now: () => new Date(),
    createSessionId,
    hashSessionId,
    signSessionClaims,
  },
);

/** ใช้ production repository แบบ transaction เดียวสำหรับ development switcher */
export async function rotateDevStaffSession(
  current: CurrentDevSession,
  targetStaffId: number,
  request: RequestFingerprintInput,
) {
  return defaultService.rotate(current, targetStaffId, request);
}

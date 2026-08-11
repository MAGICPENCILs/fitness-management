import { z } from "zod";
import { validatePassword } from "@/lib/auth/password";

const passwordFields = {
  temporaryPassword: z.string().min(1).max(1_024),
  passwordConfirmation: z.string().min(1).max(1_024),
};

/** รวมข้อผิดพลาด policy และ confirmation ไว้ที่ field ที่เกี่ยวข้อง เพื่อให้ทุก staff password route ใช้กฎเดียวกัน */
function validatePasswordPair(
  input: { temporaryPassword: string; passwordConfirmation: string },
  context: z.RefinementCtx,
) {
  const validation = validatePassword(input.temporaryPassword);
  for (const message of validation.errors) {
    context.addIssue({
      code: "custom",
      message,
      path: ["temporaryPassword"],
    });
  }
  if (input.temporaryPassword !== input.passwordConfirmation) {
    context.addIssue({
      code: "custom",
      message: "รหัสผ่านยืนยันไม่ตรงกัน",
      path: ["passwordConfirmation"],
    });
  }
}

export const staffSchema = z.object({
  staffCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, "รหัสพนักงานใช้ได้เฉพาะ A-Z ตัวเลข และ -"),
  firstName: z.string().trim().min(1, "กรุณาระบุชื่อ").max(100),
  lastName: z.string().trim().min(1, "กรุณาระบุนามสกุล").max(100),
  homeBranchId: z.coerce.number().int().positive(),
  role: z.enum(["OWNER", "MANAGER", "COUNTER", "TRAINER"]),
  phone: z.string().trim().max(20).optional(),
  email: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().trim().email("รูปแบบอีเมลไม่ถูกต้อง").max(100).optional(),
  ),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

/** ตรวจรหัสชั่วคราวซ้ำที่ server และผูก confirmation กับ request สร้างบัญชีเดียวกัน เพื่อไม่ให้เกิดบัญชีที่เข้าใช้ไม่ได้ */
export const createStaffSchema = staffSchema
  .extend(passwordFields)
  .superRefine(validatePasswordPair);

export const resetStaffPasswordSchema = z
  .object(passwordFields)
  .superRefine(validatePasswordPair);

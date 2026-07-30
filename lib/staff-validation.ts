import { z } from "zod";

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
  email: z.string().trim().email("รูปแบบอีเมลไม่ถูกต้อง").max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

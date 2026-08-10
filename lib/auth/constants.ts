/** รหัสผ่านต้องยาวพอให้การเดาสุ่มทำได้ยากขึ้น แม้มีเงื่อนไข character class อื่นแล้ว */
export const PASSWORD_MIN_LENGTH = 12;

/** ใช้ Argon2id ตามค่าที่ออกแบบไว้เพื่อสมดุลการต้าน side-channel และต้นทุนต่อการเดารหัสผ่าน */
export const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
  version: 1,
};

export const AUTH_COOKIE_NAME = "fitness_session";
/** จำกัดอายุ session สูงสุด 8 ชั่วโมง แม้ผู้ใช้ยังมี activity เพื่อจำกัดช่วงเวลาที่ token หลุดจะใช้ได้ */
export const SESSION_ABSOLUTE_LIFETIME_SECONDS = 8 * 60 * 60;
/** หมดอายุเมื่อไม่ใช้งาน 30 นาทีเพื่อลดความเสี่ยงจากเครื่องที่ถูกทิ้งไว้ */
export const SESSION_IDLE_TIMEOUT_SECONDS = 30 * 60;
/** เขียน activity ห่างอย่างน้อย 5 นาทีเพื่อลด database write โดยยังรักษา idle timeout */
export const SESSION_TOUCH_INTERVAL_SECONDS = 5 * 60;

/** ล็อกการลองรหัสผ่านของบัญชีหลังผิด 5 ครั้งในช่วง 15 นาที */
export const ACCOUNT_LOGIN_LIMIT = 5;
/** ใช้ได้เฉพาะเมื่อ TRUST_PROXY=true เพราะต้องเชื่อ forwarded IP จาก reverse proxy ที่ควบคุมได้ */
export const IP_LOGIN_LIMIT = 20;
/** ใช้หน้าต่าง 15 นาทีเดียวกันทั้ง account และ trusted IP bucket เพื่อคงนโยบาย rate limit */
export const LOGIN_LIMIT_WINDOW_SECONDS = 15 * 60;
/** ระยะล็อก 15 นาทีช่วยชะลอ brute force โดยไม่เปิดเผยรายละเอียดเฉพาะบัญชี */
export const LOGIN_LIMIT_LOCK_SECONDS = 15 * 60;

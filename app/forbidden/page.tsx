import Link from "next/link";

/** แสดงทางออกที่ปลอดภัยเมื่อ optimistic route policy ปฏิเสธสิทธิ์ โดยไม่เปิดเผยข้อมูลภายในหรือพึ่ง application shell */
export default function ForbiddenPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6 py-12 text-foreground">
      <section
        aria-labelledby="forbidden-title"
        className="w-full max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm"
      >
        <p className="text-sm font-semibold text-destructive">403</p>
        <h1 id="forbidden-title" className="mt-2 text-2xl font-bold">
          ไม่มีสิทธิ์เข้าถึง
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          บัญชีนี้ไม่มีสิทธิ์เปิดหน้าที่ร้องขอ หากต้องใช้งานส่วนนี้
          กรุณาติดต่อผู้ดูแลระบบ
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          กลับหน้าหลัก
        </Link>
      </section>
    </main>
  );
}

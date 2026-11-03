import type { MetadataRoute } from "next";

/** ประกาศ PWA metadata ขั้นต่ำสำหรับติดตั้ง Member Portal บนหน้าจอมือถือ */
export default function manifest(): MetadataRoute.Manifest {
  return { name: "Fitness Pro Member", short_name: "Fitness Pro", description: "Member Portal สำหรับแพ็กเกจ คลาส ประวัติ และ Dynamic QR", start_url: "/member", display: "standalone", background_color: "#10121c", theme_color: "#6557e8", icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }] };
}

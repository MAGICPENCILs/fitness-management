"use client";

import { useRouter } from "next/navigation";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { Member } from "@/db/schema";

const statusLabel: Record<string, {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline"
}> = {
  ACTIVE:    { label: "ใช้งาน",    variant: "default" },
  EXPIRED:   { label: "หมดอายุ",   variant: "destructive" },
  FROZEN:    { label: "พักใช้งาน", variant: "secondary" },
  SUSPENDED: { label: "ถูกระงับ",  variant: "destructive" },
  CANCELLED: { label: "ยกเลิก",    variant: "outline" },
};

export function MembersTable({ data }: { data: Member[] }) {
  const router = useRouter();

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัสสมาชิก</TableHead>
            <TableHead>ชื่อ-นามสกุล</TableHead>
            <TableHead>เบอร์โทร</TableHead>
            <TableHead>อีเมล</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>วันที่สมัคร</TableHead>
            <TableHead>จัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7}
                className="text-center text-muted-foreground py-8">
                ยังไม่มีสมาชิก
              </TableCell>
            </TableRow>
          ) : (
            data.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">
                  {member.memberCode}
                </TableCell>
                <TableCell>
                  {member.firstName} {member.lastName}
                </TableCell>
                <TableCell>{member.phone ?? "-"}</TableCell>
                <TableCell>{member.email ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={statusLabel[member.status].variant}>
                    {statusLabel[member.status].label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {member.createdAt
                    ? new Date(member.createdAt).toLocaleDateString("th-TH")
                    : "-"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/members/${member.id}`)}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
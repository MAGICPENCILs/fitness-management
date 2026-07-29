import "server-only";

import { gte } from "drizzle-orm";
import { db } from "@/db";
import { members, payments } from "@/db/schema";

export type DashboardData = {
  totalMembers: number;
  activeMembers: number;
  todayRevenue: number;
  daily: { date: string; revenue: number }[];
  monthly: { month: string; revenue: number }[];
};

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export async function getDashboardData(): Promise<DashboardData> {
  const today = new Date();
  const firstMonth = new Date(today.getFullYear(), today.getMonth() - 11, 1);

  const [memberRows, paymentRows] = await Promise.all([
    db.select({ status: members.status }).from(members),
    db
      .select({ amount: payments.amount, status: payments.status, createdAt: payments.createdAt })
      .from(payments)
      .where(gte(payments.createdAt, firstMonth)),
  ]);

  const paidPayments = paymentRows.filter(
    (payment): payment is typeof payment & { createdAt: Date } =>
      payment.status === "PAID" && payment.createdAt !== null,
  );

  const todayRevenue = paidPayments
    .filter((payment) => isSameDay(payment.createdAt, today))
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));

    return {
      date: date.toLocaleDateString("th-TH", { day: "numeric", month: "short" }),
      revenue: paidPayments
        .filter((payment) => isSameDay(payment.createdAt, date))
        .reduce((sum, payment) => sum + Number(payment.amount), 0),
    };
  });

  const monthly = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (11 - index), 1);

    return {
      month: date.toLocaleDateString("th-TH", { month: "short", year: "2-digit" }),
      revenue: paidPayments
        .filter(
          (payment) =>
            payment.createdAt.getFullYear() === date.getFullYear() &&
            payment.createdAt.getMonth() === date.getMonth(),
        )
        .reduce((sum, payment) => sum + Number(payment.amount), 0),
    };
  });

  return {
    totalMembers: memberRows.length,
    activeMembers: memberRows.filter((member) => member.status === "ACTIVE").length,
    todayRevenue,
    daily,
    monthly,
  };
}

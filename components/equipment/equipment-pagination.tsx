import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  EquipmentDashboardFilters,
  PaginationDto,
} from "@/lib/equipment-service";
import { buildEquipmentHref } from "@/components/equipment/equipment-types";

/** ย่อเลขหน้าให้มีต้นทาง ปลายทาง และบริเวณหน้าปัจจุบันโดยไม่สร้างลิงก์จำนวนมากเกินจำเป็น */
function getVisiblePages(page: number, totalPages: number) {
  return Array.from(
    new Set([1, page - 1, page, page + 1, totalPages]),
  ).filter((value) => value >= 1 && value <= totalPages);
}

export function EquipmentPagination({
  pagination,
  filters,
  pageKey,
}: {
  pagination: PaginationDto;
  filters: EquipmentDashboardFilters;
  pageKey: "page" | "historyPage";
}) {
  if (pagination.totalPages === 0) return null;
  const pages = getVisiblePages(pagination.page, pagination.totalPages);

  return (
    <nav
      aria-label={pageKey === "page" ? "หน้าทะเบียนอุปกรณ์" : "หน้าประวัติการบำรุงรักษา"}
      className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm tabular-nums text-muted-foreground">
        หน้า {pagination.page.toLocaleString("th-TH")} จาก {pagination.totalPages.toLocaleString("th-TH")} · {pagination.total.toLocaleString("th-TH")} รายการ
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {pagination.page > 1 ? (
          <Button asChild variant="outline">
            <Link
              href={buildEquipmentHref(filters, {
                [pageKey]: pagination.page - 1,
              })}
              aria-label="หน้าก่อนหน้า"
            >
              <ChevronLeft aria-hidden="true" />
              ก่อนหน้า
            </Link>
          </Button>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-3 text-sm text-muted-foreground opacity-60"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            ก่อนหน้า
          </span>
        )}
        {pages.map((page, index) => {
          const previous = pages[index - 1];
          return (
            <span key={page} className="contents">
              {previous && page - previous > 1 ? (
                <span aria-hidden="true" className="px-1 text-muted-foreground">
                  …
                </span>
              ) : null}
              <Button
                asChild
                variant={page === pagination.page ? "default" : "outline"}
                size="icon"
              >
                <Link
                  href={buildEquipmentHref(filters, { [pageKey]: page })}
                  aria-label={`หน้า ${page}`}
                  aria-current={page === pagination.page ? "page" : undefined}
                >
                  {page.toLocaleString("th-TH")}
                </Link>
              </Button>
            </span>
          );
        })}
        {pagination.page < pagination.totalPages ? (
          <Button asChild variant="outline">
            <Link
              href={buildEquipmentHref(filters, {
                [pageKey]: pagination.page + 1,
              })}
              aria-label="หน้าถัดไป"
            >
              ถัดไป
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-3 text-sm text-muted-foreground opacity-60"
          >
            ถัดไป
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}

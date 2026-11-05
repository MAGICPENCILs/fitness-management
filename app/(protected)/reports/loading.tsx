/** แสดงโครงรายงานระหว่างรอ query โดยไม่ทำให้ layout กระโดด */
export default function ReportsLoading() {
  return <div className="mx-auto w-full max-w-7xl animate-pulse space-y-6 p-4 sm:p-6 lg:p-8"><div className="h-20 rounded-xl bg-muted" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-xl bg-muted" />)}</div><div className="h-80 rounded-xl bg-muted" /></div>;
}

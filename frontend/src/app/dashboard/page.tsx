// Server component wrapper: forces this authenticated, per-user route to always
// render dynamically so it's never statically prerendered/cached (route segment
// config like `dynamic` is not honored inside a "use client" file).
export const dynamic = "force-dynamic";

import DashboardClient from "../../components/DashboardClient";

export default function DashboardPage() {
  return <DashboardClient />;
}

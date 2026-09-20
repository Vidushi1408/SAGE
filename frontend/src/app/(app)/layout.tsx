// Server layout for every signed-in page: always rendered per request (never statically cached),
// wrapping the pages in the shared workspace state and the header/navigation shell.
export const dynamic = "force-dynamic";

import WorkspaceProvider from "../../components/workspace/WorkspaceProvider";
import AppShell from "../../components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}

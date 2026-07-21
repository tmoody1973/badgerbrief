import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Card, CardTitle } from "@/components/retroui/Card";
import { AdminTabs } from "@/components/admin/admin-tabs";

export default async function AdminPage() {
  const { sessionClaims } = await auth();
  const metadata = sessionClaims?.metadata as { role?: string } | undefined;

  if (metadata?.role !== "admin") {
    redirect("/");
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12">
      <Card>
        <CardTitle>Admin</CardTitle>
        <p className="mt-2">
          Review queues, alerts, and editorial tools.
        </p>
        <AdminTabs />
      </Card>
    </main>
  );
}

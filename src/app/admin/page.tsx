import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Card, CardTitle } from "@/components/retroui/Card";

export default async function AdminPage() {
  const { sessionClaims } = await auth();
  const metadata = sessionClaims?.metadata as { role?: string } | undefined;

  if (metadata?.role !== "admin") {
    redirect("/");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <Card>
        <CardTitle>Admin</CardTitle>
        <p className="mt-2">
          Review queue, alerts, and editorial tools land here (MOO-312).
        </p>
      </Card>
    </main>
  );
}

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Card, CardTitle } from "@/components/retroui/Card";
import { ReviewQueue } from "@/components/admin/review-queue";
import { AdReviewQueue, UnattributedAds } from "@/components/admin/ad-review";
import { ArticleSources } from "@/components/admin/article-sources";

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
        <p className="mt-2 mb-4">
          Review queue, alerts, and editorial tools.
        </p>
        <AdReviewQueue />
        <UnattributedAds />
        <ReviewQueue />
        <ArticleSources />
      </Card>
    </main>
  );
}

export const metadata = { title: "Offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
      <h1 className="font-display text-3xl">You&rsquo;re offline</h1>
      <p className="mt-4 text-lg">
        BadgerBrief can&rsquo;t reach the network right now. The{" "}
        <a href="/vote" className="underline decoration-2">how-to-vote page</a>{" "}
        is saved for offline use.
      </p>
    </main>
  );
}

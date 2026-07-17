import { SignInButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Button } from "@/components/retroui/Button";
import { Card, CardTitle } from "@/components/retroui/Card";

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-tight">
          Badger<span className="text-primary">Brief</span>
        </h1>
        <div>
          {userId ? (
            <UserButton />
          ) : (
            <SignInButton mode="modal">
              <Button>Sign in</Button>
            </SignInButton>
          )}
        </div>
      </header>

      <Card>
        <CardTitle>Wisconsin&apos;s voter guide, under construction</CardTitle>
        <p className="mt-2">
          Non-partisan, source-linked, and built for the August 11, 2026
          primary. The scaffold works — the guide is on its way.
        </p>
        <div className="mt-4 flex gap-3">
          <Button variant="secondary">Primary: Aug 11</Button>
          <Link href="/admin">
            <Button variant="outline">Admin</Button>
          </Link>
        </div>
      </Card>

      <Card className="bg-secondary">
        <CardTitle>Palette check</CardTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="border-2 border-border bg-primary px-3 py-1 font-bold text-primary-foreground">
            cardinal
          </span>
          <span className="border-2 border-border bg-accent px-3 py-1 font-bold text-accent-foreground">
            lake
          </span>
          <span className="border-2 border-border bg-success px-3 py-1 font-bold text-white">
            pine
          </span>
          <span className="border-2 border-border bg-warning px-3 py-1 font-bold">
            alert
          </span>
        </div>
      </Card>
    </main>
  );
}

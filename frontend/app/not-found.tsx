"use client";
import Link from "next/link";
import { Card, Button } from "./components/ui";
import { Scene } from "./components/brand/Scenes";
import { usePrefs } from "@/lib/prefs";

export default function NotFound() {
  const { showCharacters } = usePrefs();
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="p-6 text-center">
        {showCharacters && <Scene name="notfound" height={150} className="-mx-6 -mt-6 mb-4 rounded-none border-0 border-b border-gold/25" />}
        <p className="font-mono text-2xs uppercase tracking-[0.24em] text-gold-deep">Error 404</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-navy">
          There is no page at this address.
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          The link may be old, or the item may belong to another organisation — Sentinel will not even confirm it
          exists. Nothing was changed.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/"><Button variant="primary">Back to Overview</Button></Link>
          <Link href="/content"><Button>Content queue</Button></Link>
        </div>
      </Card>
    </div>
  );
}

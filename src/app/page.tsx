"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { Wordmark } from "@/components/Logo";

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (status === "anon") router.replace("/login");
    else router.replace("/vault"); // locked or unlocked → vault handles the gate
  }, [status, router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse opacity-70">
        <Wordmark />
      </div>
    </main>
  );
}

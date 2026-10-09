import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth";
import { Seal, GuillocheBand } from "@/components/guilloche";
import { JoinFlow } from "./join-flow";

export const metadata: Metadata = { title: "Join a class" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const user = await requirePageUser("STUDENT");
  const { code } = await searchParams;
  return (
    <div className="mx-auto max-w-[480px] px-4 py-8 sm:py-12">
      <JoinFlow
        initialCode={(code ?? "").slice(0, 32)}
        studentEmail={user.email}
        seal={<Seal label="Joined" className="h-32 w-32" />}
        band={<GuillocheBand className="absolute inset-0 -z-10 h-full w-full text-green opacity-[0.1]" />}
      />
    </div>
  );
}

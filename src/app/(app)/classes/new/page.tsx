import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { GuillocheBand } from "@/components/guilloche";
import { currentAcademicYear } from "@/lib/codes";
import { CreateClassForm } from "./create-class-form";

export const metadata: Metadata = { title: "New class" };

export default async function NewClassPage() {
  const user = await requirePageUser("FACULTY");
  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/dashboard" className="hover:underline">
          Classes
        </Link>{" "}
        / New
      </div>
      <h1 className="page-title mb-6">New class</h1>
      <CreateClassForm
        facultyName={user.name}
        defaultYear={currentAcademicYear()}
        band={<GuillocheBand className="absolute inset-0 -z-10 h-full w-full text-green opacity-[0.15]" />}
      />
    </div>
  );
}

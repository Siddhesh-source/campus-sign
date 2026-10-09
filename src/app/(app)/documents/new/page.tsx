import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { getStudentClasses } from "@/server/enrollment";
import { listDocumentTypes } from "@/server/documents";
import { NewDocumentForm } from "./new-document-form";

export const metadata: Metadata = { title: "New submission" };

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const user = await requirePageUser("STUDENT");
  const [classes, types, { classId }] = await Promise.all([getStudentClasses(user.id), listDocumentTypes(), searchParams]);

  return (
    <div className="mx-auto max-w-[620px] px-4 py-8 sm:py-12">
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/documents" className="hover:underline">
          Documents
        </Link>{" "}
        / New
      </div>
      <h1 className="page-title mb-2">New submission</h1>
      <p className="mb-6 text-ink-2">Upload a PDF. You can preview it before it goes to your faculty.</p>
      {classes.length === 0 ? (
        <div className="notice notice-warn">
          <span>
            Join a class first. Documents go to the faculty of a class you&apos;re enrolled in.{" "}
            <Link href="/join" className="font-semibold underline">
              Join a class
            </Link>
          </span>
        </div>
      ) : (
        <NewDocumentForm
          classes={classes.map((c) => ({ id: c.classId, label: `${c.name} · ${c.yearOfStudy} ${c.division} · ${c.faculty.name}` }))}
          types={types.map((t) => ({ id: t.id, label: t.name }))}
          defaultClassId={classes.some((c) => c.classId === classId) ? classId : undefined}
        />
      )}
    </div>
  );
}

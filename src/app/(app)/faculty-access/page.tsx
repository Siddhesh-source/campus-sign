import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/auth";
import { RequestAccessForm } from "./request-form";

export const metadata: Metadata = { title: "Faculty access" };

export default async function FacultyAccessPage() {
  const user = await requirePageUser();
  if (user.role !== "STUDENT") redirect("/dashboard");

  return (
    <div className="mx-auto max-w-[560px] px-4 py-8 sm:py-12">
      <h1 className="page-title">Faculty access</h1>
      <p className="mt-2 text-ink-2">
        Faculty create classes and, later, sign documents. A CampusSign administrator verifies every faculty account before
        it can do either.
      </p>

      <div className="panel mt-6 p-5">
        {user.facultyStatus === "PENDING" ? (
          <div className="space-y-1.5">
            <span className="status status-warn">Request pending</span>
            <p className="text-[14px] text-ink-2">
              Your request is with the administrator. You&apos;ll get faculty tools the next time you load CampusSign after
              approval.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {user.facultyStatus === "REJECTED" && (
              <div className="notice notice-error">Your last request wasn&apos;t approved. You can ask again with more detail.</div>
            )}
            {user.facultyStatus === "REVOKED" && (
              <div className="notice notice-warn">Your faculty access was revoked by an administrator.</div>
            )}
            <p className="text-[14px] text-ink-2">
              Requesting as <span className="mono text-ink">{user.email}</span>. Students don&apos;t need to do anything
              here.
            </p>
            <RequestAccessForm />
          </div>
        )}
      </div>
    </div>
  );
}

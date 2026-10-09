import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth";
import { getClassDetail } from "@/server/classes";
import { GuillocheBand, GuillocheRosette } from "@/components/guilloche";
import { classLine, fmtDate, fmtDateTime } from "@/lib/format";
import { CodeActions, RemoveStudentButton } from "./class-client";

export const metadata: Metadata = { title: "Class" };

const stateLabel = { ACTIVE: "Active", EXPIRED: "Expired", REVOKED: "Revoked", SUPERSEDED: "Replaced" } as const;
const stateClass = { ACTIVE: "status-active", EXPIRED: "status-warn", REVOKED: "status-off", SUPERSEDED: "status-off" } as const;

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requirePageUser("FACULTY");
  const { id } = await params;
  const { created } = await searchParams;
  const cls = await getClassDetail(id, user.id);
  if (!cls) notFound();

  const code = cls.activeCode;
  const live = code?.state === "ACTIVE";
  const seatsLeft = cls.studentLimit - cls.enrollments.length;
  const [pre, mid, secret] = code ? code.code.split("-") : [];

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/dashboard" className="hover:underline">
          Classes
        </Link>{" "}
        / {cls.subjectCode} Div {cls.division}
      </div>
      <div className="mb-6">
        <h1 className="page-title">{cls.name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-muted">
          <span className="mono">{cls.subjectCode}</span>
          <span>·</span>
          <span>{classLine(cls)}</span>
          <span>·</span>
          <span className={`status ${live ? "status-active" : "status-off"}`}>{live ? "Enrolling" : "Not enrolling"}</span>
        </div>
      </div>

      {created && (
        <div className="notice notice-ok mb-6 max-w-[760px]" role="status">
          <span>
            <b>Class created.</b> Share the code below with your students. They join instantly, up to {cls.studentLimit} seats.
          </span>
        </div>
      )}

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="roster-h" className="order-2 xl:order-1">
          <div className="flex items-baseline justify-between border-b border-rule pb-2.5">
            <h2 id="roster-h" className="heading text-[17px]">
              Students <span className="mono ml-1 text-[13px] font-medium text-muted">{cls.enrollments.length}</span>
            </h2>
            <span className="mono text-[12px] text-muted">{seatsLeft > 0 ? `${seatsLeft} seats left` : "Full"}</span>
          </div>
          {cls.enrollments.length === 0 ? (
            <p className="pt-5 text-[14px] text-ink-2">
              Nobody has joined yet. Students appear here the moment they enter the code.
            </p>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th className="hidden sm:table-cell">Joined</th>
                    <th className="text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cls.enrollments.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <b className="font-semibold">{e.student.name}</b>
                        <span className="mono block text-[12px] text-muted">{e.student.email}</span>
                      </td>
                      <td className="mono hidden text-[12.5px] whitespace-nowrap text-ink-2 sm:table-cell">{fmtDateTime(e.joinedAt)}</td>
                      <td className="text-right">
                        <RemoveStudentButton classId={cls.id} enrollmentId={e.id} name={e.student.name} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="order-1 grid gap-4 xl:order-2" aria-label="Join code">
          <div className="panel relative isolate overflow-hidden p-5 shadow-[var(--shadow-2)]">
            {live && <GuillocheBand className="absolute inset-0 -z-10 h-full w-full text-green opacity-[0.15]" />}
            {live && <GuillocheRosette className="absolute -right-24 -bottom-24 -z-10 h-56 w-56 text-green opacity-[0.18]" />}
            <div className="flex items-start justify-between gap-3">
              <div className="micro">Join code</div>
              {code && <span className={`status ${stateClass[code.state]}`}>{stateLabel[code.state]}</span>}
            </div>
            {code ? (
              <div
                className={`mono mt-3 flex flex-wrap gap-x-[0.15em] text-[26px] leading-none font-semibold tracking-[0.04em] ${live ? "" : "text-muted line-through"}`}
                aria-label={`Class code ${code.code}`}
              >
                <span>{pre}</span>–<span>{mid}</span>–
                <span className={live ? "bg-[linear-gradient(transparent_62%,var(--green-tint)_62%)] text-green-ink" : ""}>{secret}</span>
              </div>
            ) : (
              <p className="mt-3 text-[14px] text-ink-2">The code was revoked. Issue a new one when you want students to join again.</p>
            )}
            <div className="mono mt-4 flex flex-wrap gap-3 border-t border-dashed border-rule-strong pt-3 text-[11.5px] tracking-[0.04em] text-muted uppercase">
              <span>{code?.expiresAt ? `Exp ${fmtDate(code.expiresAt)}` : code ? "No expiry" : "—"}</span>
              <span>
                {cls.enrollments.length}/{cls.studentLimit} seats
              </span>
              <span>Instant join</span>
            </div>
            <CodeActions classId={cls.id} code={code?.code ?? null} live={live} hasCode={!!code} />
          </div>

          <div className="panel p-4">
            <h3 className="label-caps mb-2">Code history</h3>
            <ul className="space-y-1.5">
              {cls.codeHistory.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className={`mono ${c.state === "ACTIVE" ? "" : "text-muted"}`}>{c.code}</span>
                  <span className="mono text-[11.5px] text-muted">
                    {stateLabel[c.state]} · {fmtDate(c.endedAt ?? c.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {cls.description && (
            <div className="panel p-4">
              <h3 className="label-caps mb-1.5">Description</h3>
              <p className="text-[13.5px] text-ink-2">{cls.description}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

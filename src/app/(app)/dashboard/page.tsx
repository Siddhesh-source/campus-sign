import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageUser, type CurrentUser } from "@/server/auth";
import { getFacultyClasses } from "@/server/classes";
import { getStudentClasses } from "@/server/enrollment";
import { classLine, fmtDate } from "@/lib/format";
import { JoinField, LeaveButton } from "./dashboard-client";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePageUser();
  if (user.role === "ADMIN") redirect("/admin");
  return user.role === "FACULTY" ? <FacultyHome user={user} /> : <StudentHome user={user} />;
}

// ── Student: join field first, then enrolled classes ───────────────────────

async function StudentHome({ user }: { user: CurrentUser }) {
  const classes = await getStudentClasses(user.id);
  const first = user.name.split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-[560px] px-4 py-8 sm:py-12">
      <h1 className="page-title">Hi {first}</h1>
      <p className="mt-1 text-[14px] text-muted">{user.email}</p>

      <section className="panel mt-6 p-4 sm:p-5" aria-labelledby="join-h">
        <h2 id="join-h" className="field-label mb-2">
          Got a class code?
        </h2>
        <JoinField />
      </section>

      <section className="mt-10" aria-labelledby="classes-h">
        <div className="flex items-baseline justify-between">
          <h2 id="classes-h" className="label-caps">
            Enrolled · <span className="mono">{classes.length}</span>
          </h2>
        </div>
        {classes.length === 0 ? (
          <div className="mt-3 border-t border-rule pt-5 text-[14px] text-ink-2">
            You&apos;re not in any classes yet. Enter the code your faculty shared and the class appears here.
          </div>
        ) : (
          <ul className="mt-2 border-t border-rule">
            {classes.map((c) => (
              <li key={c.enrollmentId} className="flex items-center justify-between gap-4 border-b border-rule py-3.5">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold">{c.name}</div>
                  <div className="truncate text-[12.5px] text-muted">
                    {c.faculty.name} · {classLine(c)}
                  </div>
                </div>
                <div className="flex flex-none items-center gap-3">
                  <span className="mono hidden text-[11.5px] text-muted sm:inline">since {fmtDate(c.joinedAt)}</span>
                  <LeaveButton enrollmentId={c.enrollmentId} className={c.name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Faculty: ledger of classes ─────────────────────────────────────────────

const stateLabel = { ACTIVE: "Active", EXPIRED: "Expired", REVOKED: "Revoked", SUPERSEDED: "Replaced" } as const;

async function FacultyHome({ user }: { user: CurrentUser }) {
  const classes = await getFacultyClasses(user.id);
  const students = classes.reduce((n, c) => n + c.enrolled, 0);
  const expiringSoon = classes.filter((c) => c.code?.expiresSoon).length;

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="page-title">Classes</h1>
        <Link href="/classes/new" className="btn btn-primary">
          New class
        </Link>
      </div>

      {classes.length === 0 ? (
        <div className="mt-8 max-w-[520px] border-t border-rule pt-6">
          <p className="text-[15px] text-ink-2">
            No classes yet. Create one and you&apos;ll get a join code to share with your students. They&apos;re added the
            moment they enter it.
          </p>
          <Link href="/classes/new" className="btn btn-secondary mt-4">
            Create your first class
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-2 mb-6 flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] text-muted">
            <span>
              <b className="mono mr-1 text-ink">{classes.length}</b>class{classes.length === 1 ? "" : "es"}
            </span>
            <span>
              <b className="mono mr-1 text-ink">{students}</b>student{students === 1 ? "" : "s"}
            </span>
            {expiringSoon > 0 && (
              <span>
                <b className="mono mr-1 text-warning">{expiringSoon}</b>code{expiringSoon === 1 ? "" : "s"} expiring this week
              </span>
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="ledger min-w-[640px]">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Join code</th>
                  <th>Seats</th>
                  <th>Code expires</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => {
                  const pct = Math.min(100, Math.round((c.enrolled / c.studentLimit) * 100));
                  const live = c.code?.state === "ACTIVE";
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/classes/${c.id}`} className="font-semibold hover:underline underline-offset-2">
                          {c.name}
                        </Link>
                        <span className="mono block text-[12px] text-muted">
                          {c.subjectCode} · {classLine(c)}
                        </span>
                      </td>
                      <td className="mono text-[13px] tracking-[0.03em]">
                        {c.code ? (
                          <span className={live ? "" : "text-faint line-through"}>{c.code.code}</span>
                        ) : (
                          <span className="text-faint">No active code</span>
                        )}
                      </td>
                      <td>
                        <div className="mono flex items-center gap-2 text-[12.5px]">
                          <span className="block h-1 w-16 overflow-hidden rounded-[2px] bg-sunken" aria-hidden="true">
                            <span className="block h-full bg-green" style={{ width: `${pct}%` }} />
                          </span>
                          {c.enrolled}/{c.studentLimit}
                        </div>
                      </td>
                      <td>
                        {!c.code ? (
                          <span className="status status-off">Revoked</span>
                        ) : live ? (
                          <span className="mono text-[12.5px]">{c.code.expiresAt ? fmtDate(c.code.expiresAt) : "No expiry"}</span>
                        ) : (
                          <span className="status status-off">{stateLabel[c.code.state]}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

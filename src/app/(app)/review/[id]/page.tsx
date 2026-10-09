import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requestMeta, requirePageUser } from "@/server/auth";
import { DECIDABLE, getDocument, startReview } from "@/server/documents";
import { db } from "@/server/db";
import { DocStatus, Hash, Timeline, fmtBytes } from "@/components/doc-ui";
import { classLine, fmtStamp } from "@/lib/format";
import { DecisionPanel } from "./review-client";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("FACULTY");
  const { id } = await params;
  let doc = await getDocument(user, id);
  if (!doc) notFound();
  if (doc.status === "SUBMITTED") {
    await startReview(user, id, await requestMeta());
    doc = (await getDocument(user, id))!;
  }

  const current = doc.versions.find((v) => v.id === doc.currentVersionId)!;
  const submittedVersions = doc.versions.filter((v) => v.submittedAt);
  // Faculty review what was submitted. A newer unsubmitted draft (after corrections) isn't shown.
  const reviewVersion = current.submittedAt ? current : submittedVersions[0];
  const versionNumbers = Object.fromEntries(doc.versions.map((v) => [v.id, v.number]));
  const credential = await db.signingCredential.findFirst({ where: { facultyId: user.id, status: "ACTIVE" }, select: { keyId: true } });
  const signature = doc.signatures[0];

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/inbox" className="hover:underline">
          Inbox
        </Link>{" "}
        / Review
      </div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{doc.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-muted">
            <span className="font-semibold text-ink">{doc.student.name}</span>
            <span className="mono text-[12.5px]">{doc.student.email}</span>
            <span>·</span>
            <span>{doc.type.name}</span>
            <span>·</span>
            <span>
              {doc.class.name} · {classLine(doc.class)}
            </span>
          </div>
        </div>
        <DocStatus status={doc.status} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Submitted document" className="min-w-0">
          {reviewVersion ? (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="label-caps">
                  Reviewing version <span className="mono">{reviewVersion.number}</span> · exact submitted file
                </span>
                <a href={`/api/files/${reviewVersion.id}?download`} className="btn btn-ghost btn-sm">
                  Download
                </a>
              </div>
              <iframe
                title={`${doc.title}, version ${reviewVersion.number}`}
                src={`/api/files/${reviewVersion.id}`}
                className="h-[78vh] min-h-[520px] w-full rounded-[6px] border border-rule bg-sunken"
              />
            </>
          ) : (
            <p className="text-ink-2">No submitted version yet.</p>
          )}
        </section>

        <aside className="grid gap-4">
          {DECIDABLE.includes(doc.status) && reviewVersion ? (
            <DecisionPanel
              documentId={doc.id}
              versionId={reviewVersion.id}
              versionNumber={reviewVersion.number}
              sha256={reviewVersion.sha256}
              credentialKeyId={credential?.keyId ?? null}
            />
          ) : doc.status === "APPROVED" && signature ? (
            <div className="panel space-y-2 p-5">
              <h2 className="heading text-[16px]">Approved and signed</h2>
              <div className="mono text-[16px] font-semibold text-green-ink">{signature.code}</div>
              <div className="mono text-[11.5px] text-muted">{fmtStamp(signature.signedAt)}</div>
              <div className="flex flex-wrap gap-2 pt-1">
                <a href={`/api/files/signed/${signature.id}`} className="btn btn-secondary btn-sm">
                  Signed PDF
                </a>
                <Link href={`/verify/${signature.code}`} className="btn btn-ghost btn-sm">
                  Certificate
                </Link>
              </div>
            </div>
          ) : (
            <div className="panel p-5 text-[14px] text-ink-2">
              {doc.status === "CORRECTIONS_REQUESTED"
                ? "You asked for corrections. The student's next submission will appear in your inbox."
                : "A decision has been recorded for this document."}
            </div>
          )}

          {reviewVersion && (
            <div className="panel space-y-1.5 p-4">
              <h2 className="label-caps">This version</h2>
              <Hash value={reviewVersion.sha256} full />
              <div className="mono text-[11.5px] text-muted">
                {reviewVersion.pageCount} page{reviewVersion.pageCount === 1 ? "" : "s"} · {fmtBytes(reviewVersion.sizeBytes)} · submitted {fmtStamp(reviewVersion.submittedAt!)}
              </div>
            </div>
          )}

          {submittedVersions.length > 1 && (
            <div className="panel p-4">
              <h2 className="label-caps mb-2">Earlier versions</h2>
              <ul className="space-y-1.5">
                {submittedVersions.slice(1).map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3">
                    <a href={`/api/files/${v.id}`} target="_blank" rel="noreferrer" className="text-[13.5px] font-semibold hover:underline">
                      v{v.number}
                    </a>
                    <Hash value={v.sha256} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel p-4">
            <h2 className="label-caps mb-3">History</h2>
            <Timeline events={doc.events} names={doc.actorNames} versionNumbers={versionNumbers} />
          </div>
        </aside>
      </div>
    </div>
  );
}

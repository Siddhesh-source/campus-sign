import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth";
import { getDocument } from "@/server/documents";
import { DocStatus, Hash, Timeline, fmtBytes } from "@/components/doc-ui";
import { GuillocheBand } from "@/components/guilloche";
import { classLine, fmtStamp } from "@/lib/format";
import { documentLedgerRows } from "@/server/ledger/status";
import { DocumentLedgerPanel } from "@/components/ledger-ui";
import { RouteProgress } from "@/components/route-progress";
import { currentStepOf, routeOf } from "@/server/routes";
import { NewVersionForm, SubmitPanel } from "./document-client";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ uploaded?: string }> }) {
  const user = await requirePageUser("STUDENT");
  const [{ id }, { uploaded }] = await Promise.all([params, searchParams]);
  const doc = await getDocument(user, id);
  if (!doc) notFound();

  const current = doc.versions.find((v) => v.id === doc.currentVersionId)!;
  const signature = doc.signatures[0];
  const lastDecision = [...doc.events].reverse().find((e) => e.type === "CORRECTIONS_REQUESTED" || e.type === "REJECTED");
  const versionNumbers = Object.fromEntries(doc.versions.map((v) => [v.id, v.number]));
  const ledgerRows = await documentLedgerRows(doc.id);
  // Every step's approval must be on-chain, not just the first one.
  const approvals = ledgerRows.filter((r) => r.type === "APPROVED");
  const approvalOnChain = approvals.length > 0 && approvals.every((r) => r.status === "CONFIRMED");

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/documents" className="hover:underline">
          Documents
        </Link>{" "}
        / {doc.type.name}
      </div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{doc.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-muted">
            <span>{doc.type.name}</span>
            <span>·</span>
            <span>
              {doc.class.name} · {classLine(doc.class)}
            </span>
            <span>·</span>
            <span>{doc.class.faculty.name}</span>
          </div>
        </div>
        <DocStatus status={doc.status} />
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Document preview" className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="label-caps">
              Version <span className="mono">{current.number}</span> {current.submittedAt ? "· locked" : "· draft"}
            </span>
            <a href={`/api/files/${current.id}?download`} className="btn btn-ghost btn-sm">
              Download this version
            </a>
          </div>
          <iframe title={`${doc.title}, version ${current.number}`} src={`/api/files/${current.id}`} className="h-[70vh] min-h-[480px] w-full rounded-[6px] border border-rule bg-sunken" />
        </section>

        <aside className="grid gap-4">
          {doc.status === "DRAFT" && <SubmitPanel documentId={doc.id} versionId={current.id} sha256={current.sha256} justUploaded={!!uploaded} />}

          {doc.status === "CORRECTIONS_REQUESTED" && (
            <div className="panel space-y-3 p-5">
              <h2 className="heading text-[16px]">Corrections requested</h2>
              {lastDecision?.reason && <p className="rounded-[4px] bg-sunken px-3 py-2 text-[14px] text-ink-2">{lastDecision.reason}</p>}
              <p className="text-[13.5px] text-muted">Upload a corrected PDF. It becomes version {doc.versions.length + 1}; earlier versions stay in the history.</p>
              <NewVersionForm documentId={doc.id} />
            </div>
          )}

          {(doc.status === "SUBMITTED" || doc.status === "PENDING_REVIEW") && (
            <div className="panel space-y-1.5 p-5">
              <h2 className="heading text-[16px]">{doc.status === "SUBMITTED" ? "Waiting for review" : "In review"}</h2>
              <p className="text-[14px] text-ink-2">
                {routeOf(doc).length > 1 ? `Step ${doc.currentStep} of ${routeOf(doc).length}: ${currentStepOf(doc).label}` : doc.class.faculty.name}{" "}
                {doc.status === "SUBMITTED" ? "hasn't opened it yet" : `is reviewing version ${current.number}`}. This version is locked.
              </p>
            </div>
          )}

          {doc.status === "REJECTED" && (
            <div className="panel space-y-2 p-5">
              <h2 className="heading text-[16px]">Rejected</h2>
              {lastDecision?.reason && <p className="rounded-[4px] bg-sunken px-3 py-2 text-[14px] text-ink-2">{lastDecision.reason}</p>}
              <p className="text-[13.5px] text-muted">Start a new submission if you need to send this again.</p>
            </div>
          )}

          {doc.status === "APPROVED" && signature && (
            <div className="panel relative isolate space-y-3 overflow-hidden p-5 shadow-[var(--shadow-2)]">
              <GuillocheBand className="absolute inset-0 -z-10 h-full w-full text-green opacity-[0.14]" />
              <div className="micro">Faculty decision · approved and signed</div>
              <div className="mono text-[20px] font-semibold tracking-[0.04em] text-green-ink">{signature.code}</div>
              <div className="mono text-[11.5px] text-muted">{fmtStamp(signature.signedAt)}</div>
              <p className="text-[13px] text-ink-2">
                {approvalOnChain
                  ? "Confirmed on the blockchain. This document is fully verifiable."
                  : "Waiting for blockchain confirmation. It is not fully verified until that completes."}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a href={`/api/files/signed/${signature.id}`} className="btn btn-primary btn-sm">
                  Download signed PDF
                </a>
                <Link href={`/verify/${signature.code}`} className="btn btn-secondary btn-sm">
                  View certificate
                </Link>
              </div>
            </div>
          )}

          <div className="panel p-4">
            <h2 className="label-caps mb-2">Versions</h2>
            <ul className="divide-y divide-rule">
              {doc.versions.map((v) => (
                <li key={v.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <a href={`/api/files/${v.id}`} target="_blank" rel="noreferrer" className="text-[13.5px] font-semibold hover:underline">
                      v{v.number} · {v.originalName}
                    </a>
                    <span className="mono text-[11px] text-muted">
                      {v.pageCount}p · {fmtBytes(v.sizeBytes)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-3">
                    <Hash value={v.sha256} />
                    <span className="mono text-[11px] text-muted">{v.submittedAt ? "locked" : "draft"}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <RouteProgress route={routeOf(doc)} currentStep={doc.currentStep} status={doc.status} signatures={doc.signatures} versionId={doc.currentVersionId} />
          <DocumentLedgerPanel rows={ledgerRows} />


          <div className="panel p-4">
            <h2 className="label-caps mb-3">History</h2>
            <Timeline events={doc.events} names={doc.actorNames} versionNumbers={versionNumbers} />
          </div>
        </aside>
      </div>
    </div>
  );
}

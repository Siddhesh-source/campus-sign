import type { RouteStep } from "@/server/routes";
import { fmtStamp } from "@/lib/format";

type Sig = { stepOrder: number; signedAt: Date; code: string; versionId: string; credential: { faculty: { name: string } } };

/**
 * Where a document is on its approval route. Steps are shown in order with
 * who signed and when; the current step is marked; nothing is implied about
 * steps that haven't happened.
 */
export function RouteProgress({
  route,
  currentStep,
  status,
  signatures,
  versionId,
}: {
  route: RouteStep[];
  currentStep: number;
  status: string;
  signatures: Sig[];
  versionId: string | null;
}) {
  if (route.length <= 1) return null;
  const forVersion = signatures.filter((s) => s.versionId === versionId);
  const inProgress = status === "SUBMITTED" || status === "PENDING_REVIEW";
  return (
    <div className="panel p-4">
      <h2 className="label-caps mb-3">Approval route</h2>
      <ol className="space-y-3">
        {route.map((step) => {
          const sig = forVersion.find((s) => s.stepOrder === step.order);
          const isCurrent = inProgress && step.order === currentStep;
          return (
            <li key={step.order} className="flex items-start gap-3" aria-current={isCurrent ? "step" : undefined}>
              <span
                className={`mono mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-semibold ${
                  sig ? "bg-green text-[var(--on-green)]" : isCurrent ? "border-2 border-warning text-warning" : "border border-rule-strong text-muted"
                }`}
                aria-hidden="true"
              >
                {sig ? "✓" : step.order}
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">{step.label}</div>
                <div className="text-[12px] text-muted">
                  {sig ? (
                    <>
                      Signed by {sig.credential.faculty.name} · <span className="mono">{fmtStamp(sig.signedAt)}</span>
                    </>
                  ) : isCurrent ? (
                    "Waiting for this approver"
                  ) : (
                    "Not reached yet"
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

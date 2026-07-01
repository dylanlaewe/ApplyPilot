import { NextResponse } from "next/server";

import { upsertAnswerBankItem } from "@/lib/answerBank";
import { appendAuditEntry, getApplicationSession, updateApplicationSession } from "@/lib/applications";
import { createAuditEntry } from "@/lib/auditLog";
import { rememberStructuredProfileFact } from "@/lib/profileGapLearning";
import { fillField, getBrowserSession } from "@/lib/playwrightSession";
import { humanizeError } from "@/lib/safety";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getApplicationSession(id);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      fieldId: string;
      action: "approve" | "skip";
      value?: string;
      saveAnswer?: boolean;
      canonicalQuestion?: string;
    };
    const field = session.detectedFields.find((entry) => entry.id === body.fieldId);
    if (!field) {
      return NextResponse.json({ error: "Field not found." }, { status: 404 });
    }

    let auditEntry = createAuditEntry(id, "needs_review", `Reviewed ${field.label || field.name || "field"}.`);

    if (body.action === "approve") {
      const runtime = getBrowserSession(id);
      if (!runtime || runtime.page.isClosed()) {
        throw new Error("Open the application window before filling approved fields.");
      }

      const approvedValue = body.value ?? field.suggestedValue;
      const verification = await fillField(runtime.page, field, approvedValue);
      const updated = await updateApplicationSession(id, (current) => ({
        ...(() => {
          const normalizedApprovedValue = approvedValue.trim();
          const normalizedSuggestedValue = field.suggestedValue.trim();
          const acceptedManualAnswer = Boolean(normalizedApprovedValue) && !normalizedSuggestedValue;
          const correctedSuggestedAnswer =
            Boolean(normalizedApprovedValue) &&
            Boolean(normalizedSuggestedValue) &&
            normalizedApprovedValue !== normalizedSuggestedValue;
          const detectedFields = current.detectedFields.map((entry) =>
            entry.id === body.fieldId
              ? {
                  ...entry,
                  suggestedValue: approvedValue,
                  status: "filled" as const,
                  reviewCategory: null,
                  reason: "Filled after manual review and explicit approval.",
                  verificationStatus: "verified" as const,
                  verificationMessage: verification.message
                }
              : entry
          );
          const stillNeedsReview = detectedFields.some((entry) => ["needs_review", "sensitive", "unknown", "error"].includes(entry.status));
          const telemetry = current.dogfoodTelemetry ?? {
            sessionStartedAt: current.createdAt,
            applicationFormReachedAt: "",
            initialAutofillCompletedAt: "",
            userReviewCompletedAt: "",
            readyForSubmissionAt: "",
            fieldsDetectedAtLastPass: current.fieldsDetected,
            fieldsFilledVerifiedAtLastPass: current.fieldsFilledAndVerified,
            fieldsUnresolvedAtLastPass: current.fieldsUnresolved,
            userCorrections: 0,
            manualAnswers: 0,
            autofillRetries: 0
          };
          const now = new Date().toISOString();
          return {
            ...current,
            detectedFields,
            lastError: undefined,
            status: stillNeedsReview ? "needs_review" : "ready_for_submission",
            statusMessage: stillNeedsReview ? "A few answers still need you." : "Ready for final review.",
            nextAction: stillNeedsReview
              ? "Review the remaining questions, then continue in the browser."
              : "Review the page in the browser and submit on the job site when you are ready.",
            dogfoodTelemetry: {
              ...telemetry,
              userCorrections: telemetry.userCorrections + (correctedSuggestedAnswer ? 1 : 0),
              manualAnswers: telemetry.manualAnswers + (acceptedManualAnswer ? 1 : 0),
              userReviewCompletedAt: stillNeedsReview ? telemetry.userReviewCompletedAt : telemetry.userReviewCompletedAt || now,
              readyForSubmissionAt: stillNeedsReview ? telemetry.readyForSubmissionAt : telemetry.readyForSubmissionAt || now
            }
          };
        })()
      }));
      auditEntry = createAuditEntry(id, "field_filled", `Filled ${field.label || field.name || "field"} after review.`, {
        fieldId: field.id,
        reason: "Human approved this field in the review queue."
      });
      let withAudit = await appendAuditEntry(id, auditEntry);

      if (body.saveAnswer && body.canonicalQuestion?.trim() && approvedValue.trim()) {
        await upsertAnswerBankItem({
          label: body.canonicalQuestion.trim(),
          canonicalQuestion: body.canonicalQuestion.trim(),
          questionPatterns: [field.label, field.name, field.intent.replaceAll("_", " ")].filter(Boolean),
          answer: approvedValue.trim(),
          intent: field.intent,
          fieldType: field.type,
          optionLabel: field.matchedOption || "",
          sensitivity: field.sensitivity,
          autoFillAllowed: field.sensitivity === "safe"
        });
        await rememberStructuredProfileFact(field, approvedValue.trim());
        withAudit = await appendAuditEntry(
          id,
          createAuditEntry(id, "answer_saved", `Saved an answer for ${field.label || field.name || "field"}.`, {
            fieldId: field.id,
            reason: `Saved under canonical question: ${body.canonicalQuestion.trim()}`
          })
        );
      }

      return NextResponse.json({ session: withAudit, message: "Field approved and filled." });
    }

    const updated = await updateApplicationSession(id, (current) => ({
      ...(() => {
        const detectedFields = current.detectedFields.map((entry) =>
          entry.id === body.fieldId
            ? {
                ...entry,
                status: "skipped" as const,
                reviewCategory: entry.isRequired ? ("required_missing" as const) : ("optional_skipped" as const),
                reason: "Skipped after manual review."
              }
            : entry
        );
        const stillNeedsReview = detectedFields.some((entry) => ["needs_review", "sensitive", "unknown", "error"].includes(entry.status));
        const telemetry = current.dogfoodTelemetry ?? {
          sessionStartedAt: current.createdAt,
          applicationFormReachedAt: "",
          initialAutofillCompletedAt: "",
          userReviewCompletedAt: "",
          readyForSubmissionAt: "",
          fieldsDetectedAtLastPass: current.fieldsDetected,
          fieldsFilledVerifiedAtLastPass: current.fieldsFilledAndVerified,
          fieldsUnresolvedAtLastPass: current.fieldsUnresolved,
          userCorrections: 0,
          manualAnswers: 0,
          autofillRetries: 0
        };
        const now = new Date().toISOString();
        return {
          ...current,
          detectedFields,
          status: stillNeedsReview ? "needs_review" : "ready_for_submission",
          statusMessage: stillNeedsReview ? "A few answers still need you." : "Ready for final review.",
          nextAction: stillNeedsReview
            ? "Review the remaining questions, then continue in the browser."
            : "Review the page in the browser and submit on the job site when you are ready.",
          dogfoodTelemetry: {
            ...telemetry,
            userReviewCompletedAt: stillNeedsReview ? telemetry.userReviewCompletedAt : telemetry.userReviewCompletedAt || now,
            readyForSubmissionAt: stillNeedsReview ? telemetry.readyForSubmissionAt : telemetry.readyForSubmissionAt || now
          }
        };
      })()
    }));
    auditEntry = createAuditEntry(id, "field_skipped", `Skipped ${field.label || field.name || "field"}.`, {
      fieldId: field.id,
      reason: "Human skipped this field from the review queue."
    });
    const withAudit = await appendAuditEntry(id, auditEntry);
    return NextResponse.json({ session: withAudit, message: "Field skipped." });
  } catch (error) {
    return NextResponse.json({ error: humanizeError(error) }, { status: 500 });
  }
}

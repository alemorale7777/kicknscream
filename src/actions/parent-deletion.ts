"use server";

/**
 * Global-deletion request flow lives in Task 22 — this stub exposes the
 * signature so Task 20's `ParentDangerZone` component typechecks today.
 * When Task 22 lands it'll replace the body with the real token-issue +
 * email-send pipeline (parent must confirm via the link in their inbox
 * before the actual anonymization runs).
 */
export async function requestParentDeletionAction(input: {
  tenantId: string;
  parentId: string;
}): Promise<void> {
  void input;
  throw new Error("Not implemented yet");
}

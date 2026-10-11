import type { AccountScope, LocalScope } from "../types/cloud";

const LEGACY_DB_NAME = "central-estudos" as const;
const STUDY_PREFIX = "central-estudos-account";
const SYNC_PREFIX = "central-estudos-sync";

export function localAccountScope(): LocalScope {
  return {
    mode: "off",
    scopeHash: null,
    studyDbName: LEGACY_DB_NAME,
    syncMetaDbName: null,
  };
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function deriveAccountScope(
  projectRef: string,
  authUid: string,
): Promise<AccountScope> {
  if (!projectRef.trim() || !authUid.trim())
    throw new Error("Escopo de conta exige projectRef e identidade validados");
  const input = new TextEncoder().encode(`${projectRef}\u0000${authUid}`);
  const scopeHash = hex(await crypto.subtle.digest("SHA-256", input));
  return {
    mode: "account",
    scopeHash,
    studyDbName: `${STUDY_PREFIX}:${scopeHash}`,
    syncMetaDbName: `${SYNC_PREFIX}:${scopeHash}`,
  };
}

export function databaseNameForScope(scope: AccountScope) {
  return scope.studyDbName;
}

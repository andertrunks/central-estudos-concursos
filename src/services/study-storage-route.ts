import { localAccountScope } from "./account-scope";
import type { AccountScope } from "../types/cloud";

let activeScope: AccountScope = localAccountScope();
let epoch = 0;

export function studyScopeKey(scope: AccountScope) {
  return scope.mode === "off" ? "local:legacy" : `account:${scope.scopeHash}`;
}

export function setActiveStudyScope(scope: AccountScope) {
  if (studyScopeKey(scope) !== studyScopeKey(activeScope)) {
    activeScope = scope;
    epoch += 1;
  } else {
    activeScope = scope;
  }
  return epoch;
}

export function getActiveStudyScope() {
  return activeScope;
}

export function getActiveStudyEpoch() {
  return epoch;
}

export function captureStudyRoute() {
  return { scope: activeScope, epoch, key: studyScopeKey(activeScope) } as const;
}

export function isCurrentStudyRoute(expectedEpoch: number) {
  return epoch === expectedEpoch;
}

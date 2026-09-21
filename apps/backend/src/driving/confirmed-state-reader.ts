import type { ConfirmedState } from "@drivacy/shared";

export interface ConfirmedDrivingStateReader { getConfirmedState(evaluationScopeId: string): Promise<ConfirmedState | undefined>; }

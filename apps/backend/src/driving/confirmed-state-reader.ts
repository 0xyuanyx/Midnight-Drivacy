export interface ConfirmedDrivingStateReader { getConfirmedDistanceM(evaluationScopeId: string): Promise<number | undefined>; }

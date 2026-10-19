export enum OrderStatusEnum {
  Received = "received",
  AwaitingPayment = "awaiting_payment",
  Authorized = "authorized",
  Checking = "checking",
  PendingApproval = "pending_approval",
  Captured = "captured",
  Voided = "voided",
  Rejected = "rejected",
  Failed = "failed",
}

export enum OrderFilterTabEnum {
  All = "all",
  NeedsApproval = "needs_approval",
  Paid = "paid",
  Blocked = "blocked",
  InProgress = "in_progress",
}

export enum SecurityCheckStepEnum {
  VerifyAgent = "verify_agent",
  CheckMandate = "check_mandate",
  AuthorizePayment = "authorize_payment",
  ScanInjection = "scan_injection",
  IntentDiff = "intent_diff",
  GraphRisk = "graph_risk",
  Decide = "decide",
  CaptureOrVoid = "capture_or_void",
  BuildProof = "build_proof",
}

export enum SecurityCheckResultEnum {
  Pass = "pass",
  Fail = "fail",
  Flag = "flag",
  Skip = "skip",
  Error = "error",
}

export enum ApprovalDecisionEnum {
  Approved = "approved",
  Declined = "declined",
}

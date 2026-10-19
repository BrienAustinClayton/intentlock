export enum ChatRoleEnum {
  User = "user",
  Assistant = "assistant",
}

export enum AgentRunStatusEnum {
  Running = "running",
  Ordered = "ordered",
  Failed = "failed",
}

/** Outcome of Sepilo's cart check before anything is bought. */
export enum CartReviewDecisionEnum {
  Ok = "ok",
  Confirm = "confirm",
  Block = "block",
}

export enum CartCheckStatusEnum {
  Pass = "pass",
  Warn = "warn",
  Block = "block",
}

export enum ScenarioPhaseEnum {
  Idle = "idle",
  Running = "running",
  Fetching = "fetching",
  Done = "done",
  Error = "error",
}

export enum ScenarioIdEnum {
  Normal = "normal",
  HiddenGiftCard = "hidden_gift_card",
  WrongVariant = "wrong_variant",
  OverpricedMerchant = "overpriced_merchant",
  BotFarm = "bot_farm",
  RevokedAgent = "revoked_agent",
}

export enum ScenarioDecisionEnum {
  Capture = "capture",
  Hold = "hold",
  Void = "void",
  Reject = "reject",
}

export enum RevealPhaseEnum {
  Idle = "idle",
  Loading = "loading",
  Done = "done",
  Error = "error",
}

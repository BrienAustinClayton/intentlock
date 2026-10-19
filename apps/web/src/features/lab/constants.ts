import { ScenarioDecisionEnum, ScenarioIdEnum } from "./enums";
import { ScenarioDefinition } from "./types";

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: ScenarioIdEnum.Normal,
    title: "Normal Purchase",
    narration:
      "A clean checkout with genuine items requested by the user, matching the signed mandate and passing all security gates.",
    expectedDecision: ScenarioDecisionEnum.Capture,
    pageUrls: ["/store/normal/headphones.html"],
  },
  {
    id: ScenarioIdEnum.HiddenGiftCard,
    title: "Hidden Gift Card Injection",
    narration:
      "The merchant page hides prompt injection instructions in off-screen CSS attempting to add a $500 gift card into the cart.",
    expectedDecision: ScenarioDecisionEnum.Void,
    pageUrls: ["/store/attack/injection.html"],
  },
  {
    id: ScenarioIdEnum.WrongVariant,
    title: "Wrong Product Variant",
    narration:
      "The agent attempts to swap a requested color or size variant. Caught by semantic intent diff comparison.",
    expectedDecision: ScenarioDecisionEnum.Hold,
    pageUrls: ["/store/normal/variant.html"],
  },
  {
    id: ScenarioIdEnum.OverpricedMerchant,
    title: "Overpriced Merchant Anomaly",
    narration:
      "A unit price anomaly where the checkout price drastically exceeds the known reference catalog price.",
    expectedDecision: ScenarioDecisionEnum.Hold,
    pageUrls: ["/store/normal/price.html"],
  },
  {
    id: ScenarioIdEnum.BotFarm,
    title: "Bot Farm Network Fraud",
    narration:
      "Shared keys or rapid automated checkouts detected across multiple merchant clusters by the fraud graph.",
    expectedDecision: ScenarioDecisionEnum.Void,
    pageUrls: [],
  },
  {
    id: ScenarioIdEnum.RevokedAgent,
    title: "Revoked Agent Signature",
    narration:
      "The shopping agent key was previously revoked by the user, failing cryptographic verification immediately.",
    expectedDecision: ScenarioDecisionEnum.Reject,
    pageUrls: [],
  },
];

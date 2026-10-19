import { RulePeriodEnum } from "./enums";

export const SHOPPING_CATEGORIES: Record<string, string> = {
  electronics: "Electronics",
  "home-garden": "Home and garden",
  "health-beauty": "Health and beauty",
  "baby-toddler": "Baby and toddler",
  "apparel-accessories": "Clothing and accessories",
  "toys-games": "Toys and games",
  "animals-pet-supplies": "Pets",
  "office-supplies": "Office supplies",
  furniture: "Furniture",
  "sporting-goods": "Sports and outdoors",
  "food-beverages-tobacco": "Food and drink",
  "arts-entertainment": "Arts and hobbies",
  hardware: "Hardware",
  "cameras-optics": "Cameras",
  "luggage-bags": "Bags and luggage",
  media: "Books and media",
};

export const PERIOD_LABELS: Record<RulePeriodEnum, string> = {
  [RulePeriodEnum.Month]: "Per month",
  [RulePeriodEnum.Week]: "Per week",
  [RulePeriodEnum.Once]: "Single purchase",
};

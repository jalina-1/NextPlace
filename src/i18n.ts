import { messages } from "./messages.en";
// English catalog. Add Sinhala/Tamil catalogs with the same keys when translations are available.
export const en = {
  ...messages,
  brand: "NextPlace",
  sharedPostLabel: "Same post for missing rows (optional)",
  sharedPostPlaceholder:
    "Enter the post or designation from your source document",
  sharedPostHelp:
    "Only use this if the empty rows refer to the same post. Existing post values and original uploaded columns will not be changed. Review the filled rows before confirming.",
  fillMissingPosts: "Fill missing posts",
  incompleteRows: "Rows still needing institution or post:",
  firstIncompleteRow: "First incomplete source row:",
  tagline: "A clearer path to your next posting.",
  dashboard: "My projects",
  preferences: "Preferences",
  import: "Import & review",
  results: "Ranked results",
  compare: "Compare",
  editor: "Final preference list",
  payment: "Premium access",
  account: "Account & privacy",
  admin: "Administration",
  logout: "Sign out",
  save: "Save changes",
  unknown: "Unknown",
  provisional: "Provisional",
  synthetic: "Synthetic demo · not real research",
  disclaimer:
    "A planning tool for your preferences. Not an official application, eligibility assessment, or guarantee of transfer.",
};

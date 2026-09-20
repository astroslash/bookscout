import { connectorManifestSchema } from "@/platform/manifest";

export const bookScoutManifest = connectorManifestSchema.parse({
  id: "book-scout",
  name: "Book Scout",
  version: "1.0.0",
  description: "Personalized book recommendations for children and teens.",
  examples: [
    "What should my 11-year-old read next?",
    "Find books like Percy Jackson.",
    "My daughter loves fantasy and writing. Recommend five books.",
  ],
  monetization: "affiliate",
});

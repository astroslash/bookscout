import type { CommerceProvider, Product } from "@/platform/commerce";
import { InvalidInputError } from "@/platform/errors";

export class AmazonCommerceProvider implements CommerceProvider {
  constructor(private readonly associateTag: string) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(associateTag)) {
      throw new Error("AMAZON_ASSOCIATES_TAG is invalid.");
    }
  }

  async createLink(product: Product): Promise<string> {
    const query = product.searchQuery.trim();
    if (!query || query.length > 300) throw new InvalidInputError("Product search query is invalid.");
    const url = new URL("https://www.amazon.com/s/");
    url.searchParams.set("field-keywords", query);
    url.searchParams.set("search-alias", "stripbooks");
    url.searchParams.set("tag", this.associateTag);
    return url.toString();
  }
}

export function createAmazonCommerceProviderFromEnv(): AmazonCommerceProvider | null {
  const tag = process.env.AMAZON_ASSOCIATES_TAG?.trim();
  return tag ? new AmazonCommerceProvider(tag) : null;
}

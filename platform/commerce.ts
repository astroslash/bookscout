export interface Product {
  id: string;
  title: string;
  searchQuery: string;
}

export interface CommerceProvider {
  createLink(product: Product, campaign?: string): Promise<string>;
}

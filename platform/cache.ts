export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T>;
}

export class MemoryCache implements Cache {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new InvalidInputError("Cache TTL must be a positive number of seconds.");
    }
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await load();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

import { InvalidInputError } from "./errors";

import type { MetadataStorage } from "../file-system/content-store.ts";

export const TOKEN_KEY = "smartc-studio:github-token";

export class TokenStore {
  constructor(private readonly storage: MetadataStorage) {}

  get(): string | null {
    return this.storage.getItem(TOKEN_KEY) || null;
  }

  set(token: string): void {
    this.storage.setItem(TOKEN_KEY, token);
  }

  /** MetadataStorage has no removeItem, so an empty string means "no token". */
  clear(): void {
    this.storage.setItem(TOKEN_KEY, "");
  }
}

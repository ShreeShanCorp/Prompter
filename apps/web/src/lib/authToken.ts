type TokenGetter = () => Promise<string | null>;

let getTokenFn: TokenGetter | null = null;

/** Called once from a component inside ClerkProvider to bridge Clerk's session token into apiClient. */
export function setTokenGetter(fn: TokenGetter) {
  getTokenFn = fn;
}

export async function getAuthToken(): Promise<string | null> {
  if (!getTokenFn) return null;
  return getTokenFn();
}

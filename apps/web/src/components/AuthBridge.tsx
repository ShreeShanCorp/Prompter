import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { setTokenGetter } from "../lib/authToken";

/** Bridges Clerk's session token into apiClient (a plain fetch wrapper, not a hook). */
export function AuthBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenGetter(() => getToken());
  }, [getToken]);

  return null;
}

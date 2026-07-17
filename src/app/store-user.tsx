"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";

/** Silently upserts the signed-in user into Convex `users`. Mount once in the layout. */
export function StoreUser() {
  const { isAuthenticated } = useConvexAuth();
  const store = useMutation(api.users.store);

  useEffect(() => {
    if (isAuthenticated) {
      void store({});
    }
  }, [isAuthenticated, store]);

  return null;
}

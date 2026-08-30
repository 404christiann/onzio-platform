type AuthOperationError = {
  code?: string;
  message: string;
};

type RefreshableSession = {
  access_token: string;
};

export type OperatorSessionRevocationClient = {
  admin: {
    signOut: (
      accessToken: string,
      scope: "local",
    ) => Promise<{ data: null; error: AuthOperationError | null }>;
  };
  refreshSession: (input: { refresh_token: string }) => Promise<{
    data: { session: RefreshableSession | null; user?: unknown };
    error: AuthOperationError | null;
  }>;
};

type OperatorSessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export async function revokeOperatorSession(
  auth: OperatorSessionRevocationClient,
  tokens: OperatorSessionTokens,
): Promise<{ revoked: true; refreshRejected: true }> {
  const logout = await auth.admin.signOut(tokens.accessToken, "local");
  if (logout.error) {
    throw new Error("Operator session revocation failed");
  }

  const refreshProbe = await auth.refreshSession({
    refresh_token: tokens.refreshToken,
  });
  if (refreshProbe.data.session) {
    const cleanup = await auth.admin.signOut(
      refreshProbe.data.session.access_token,
      "local",
    );
    if (cleanup.error) {
      throw new Error(
        "Operator session remained refreshable and cleanup failed",
      );
    }
    throw new Error("Operator session remained refreshable after revocation");
  }
  if (!refreshProbe.error) {
    throw new Error("Operator session revocation could not be proven");
  }
  if (refreshProbe.error.code !== "refresh_token_not_found") {
    throw new Error("Operator session revocation could not be proven");
  }

  return { revoked: true, refreshRejected: true };
}

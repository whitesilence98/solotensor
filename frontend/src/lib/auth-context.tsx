"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  api,
  getAuthToken,
  getSecondsUntilMidnight,
  setAuthToken,
  ApiError,
  AUTH_CREDITS_KEY,
  AUTH_USER_KEY,
  type CreditStatus,
  type LoginPayload,
  type RegisterPayload,
  type UserProfile,
  type UserRole,
  normalizeRoleName,
  getDefaultPermissionsForRole,
  setLocalUserRole,
} from "./api";

export interface AuthContextType {
  user: UserProfile | null;
  credits: CreditStatus;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  authModalReason: string | null;
  primaryRole: string;
  roles: string[];
  permissions: string[];
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
  isPro: boolean;
  isMod: boolean;
  isAdmin: boolean;
  switchRoleDemo: (role: UserRole) => void;
  login: (emailOrUsername: string, password?: string) => Promise<UserProfile>;
  loginWithOAuth: (provider: "google" | "discord") => Promise<UserProfile>;
  register: (
    email: string,
    username: string,
    password?: string,
    displayName?: string
  ) => Promise<UserProfile>;
  logout: () => void;
  claimDaily: () => Promise<{ success: boolean; message: string }>;
  refreshCredits: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  resetPassword: (
    token: string,
    new_password: string
  ) => Promise<{ success: boolean; message: string }>;
  verifyEmail: (params: {
    token?: string;
    otp_code?: string;
  }) => Promise<{ success: boolean; message: string }>;
  resendVerification: (
    email?: string
  ) => Promise<{ success: boolean; message: string }>;
  openAuthModal: (reason?: string | unknown) => void;
  closeAuthModal: () => void;
}

const DEFAULT_CREDITS: CreditStatus = {
  balance: 100,
  dailyAllowance: 100,
  nextResetInSeconds: getSecondsUntilMidnight(),
  lastClaimedAt: null,
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditStatus>(DEFAULT_CREDITS);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState<string | null>(null);

  // Initialize from storage or backend session
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const storedToken = getAuthToken();
        const storedUser = localStorage.getItem(AUTH_USER_KEY);
        const storedCredits = localStorage.getItem(AUTH_CREDITS_KEY);

        let parsedCredits: CreditStatus = DEFAULT_CREDITS;
        if (storedCredits) {
          try {
            parsedCredits = JSON.parse(storedCredits);
            parsedCredits.nextResetInSeconds = getSecondsUntilMidnight();
          } catch {
            /* ignore JSON parse error */
          }
        }

        if (storedToken) {
          setTokenState(storedToken);
          if (storedUser) {
            try {
              setUser(JSON.parse(storedUser));
            } catch {
              /* ignore */
            }
          }
          setCredits(parsedCredits);

          // Attempt to verify with /api/auth/me
          try {
            const remoteSession = await api.getMe();
            if (mounted && remoteSession?.user) {
              setUser(remoteSession.user);
              if (remoteSession.credits) {
                setCredits(remoteSession.credits);
                localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(remoteSession.credits));
              }
              localStorage.setItem(AUTH_USER_KEY, JSON.stringify(remoteSession.user));
            }
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
              setAuthToken(null);
              setTokenState(null);
              setUser(null);
              try {
                localStorage.removeItem(AUTH_USER_KEY);
                localStorage.removeItem(AUTH_CREDITS_KEY);
              } catch {
                /* ignore */
              }
            }
            // Keep local session if server is offline / transient network error
          }
        } else {
          setCredits(parsedCredits);
        }
      } catch {
        /* storage access error */
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void initializeAuth();

    return () => {
      mounted = false;
    };
  }, []);

  // Live countdown ticker for daily credit reset
  useEffect(() => {
    const timer = setInterval(() => {
      setCredits((prev) => {
        if (prev.nextResetInSeconds <= 1) {
          // Midnight reset triggered
          const nextSeconds = getSecondsUntilMidnight();
          const refreshed: CreditStatus = {
            ...prev,
            balance: prev.dailyAllowance,
            nextResetInSeconds: nextSeconds,
          };
          try {
            localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(refreshed));
          } catch {
            /* ignore */
          }
          return refreshed;
        }
        return {
          ...prev,
          nextResetInSeconds: prev.nextResetInSeconds - 1,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const openAuthModal = useCallback((reason?: unknown) => {
    setAuthModalReason(typeof reason === "string" ? reason : null);
    setIsAuthModalOpen(true);
  }, []);
  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setAuthModalReason(null);
  }, []);

  const login = useCallback(
    async (emailOrUsername: string, password?: string): Promise<UserProfile> => {
      const payload: LoginPayload = {
        emailOrUsername,
        password,
        provider: "credentials",
      };
      const response = await api.login(payload);
      setAuthToken(response.token);
      setTokenState(response.token);
      setUser(response.user);
      setCredits(response.credits);
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
        localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(response.credits));
      } catch {
        /* ignore */
      }
      setIsAuthModalOpen(false);
      return response.user;
    },
    []
  );

  const loginWithOAuth = useCallback(
    async (provider: "google" | "discord"): Promise<UserProfile> => {
      const mockName = provider === "google" ? "google_creator" : "discord_creator";
      const payload: LoginPayload = {
        emailOrUsername: `${mockName}@${provider}.com`,
        provider,
      };
      const response = await api.login(payload);
      setAuthToken(response.token);
      setTokenState(response.token);
      setUser(response.user);
      setCredits(response.credits);
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
        localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(response.credits));
      } catch {
        /* ignore */
      }
      setIsAuthModalOpen(false);
      return response.user;
    },
    []
  );

  const register = useCallback(
    async (
      email: string,
      username: string,
      password?: string,
      displayName?: string
    ): Promise<UserProfile> => {
      const payload: RegisterPayload = {
        email,
        username,
        password,
        displayName: displayName || username,
      };
      const response = await api.register(payload);
      setAuthToken(response.token);
      setTokenState(response.token);
      setUser(response.user);
      setCredits(response.credits);
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
        localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(response.credits));
      } catch {
        /* ignore */
      }
      setIsAuthModalOpen(false);
      return response.user;
    },
    []
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setTokenState(null);
    setUser(null);
    try {
      localStorage.removeItem(AUTH_USER_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshCredits = useCallback(async () => {
    try {
      const remote = await api.getMe();
      if (remote?.credits) {
        setCredits(remote.credits);
        localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(remote.credits));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const claimDaily = useCallback(async (): Promise<{
    success: boolean;
    message: string;
  }> => {
    if (credits.balance >= credits.dailyAllowance) {
      return {
        success: false,
        message: "Energy pool is already full for today.",
      };
    }
    try {
      const updated = await api.claimDailyEnergy();
      setCredits(updated);
      try {
        localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      return {
        success: true,
        message: `Claimed +25 energy! Current balance: ${updated.balance} / ${updated.dailyAllowance}.`,
      };
    } catch (err) {
      return {
        success: false,
        message:
          err instanceof Error
            ? err.message
            : "Could not claim daily energy bonus.",
      };
    }
  }, [credits.balance, credits.dailyAllowance]);

  const forgotPassword = useCallback(async (email: string) => {
    return api.forgotPassword(email);
  }, []);

  const resetPassword = useCallback(
    async (token: string, new_password: string) => {
      return api.resetPassword(token, new_password);
    },
    []
  );

  const verifyEmail = useCallback(
    async (params: { token?: string; otp_code?: string }): Promise<{
      success: boolean;
      message: string;
    }> => {
      const result = await api.verifyEmail(params);
      if (result.success) {
        setUser((prev) => {
          if (!prev) return null;
          const updated = { ...prev, is_verified: true };
          try {
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
          } catch {
            /* ignore */
          }
          return updated;
        });
      }
      return result;
    },
    []
  );

  const resendVerification = useCallback(
    async (email?: string) => {
      const targetEmail = email || user?.email;
      return api.resendVerification(targetEmail);
    },
    [user?.email]
  );

  const primaryRole = useMemo(() => {
    return normalizeRoleName(user?.primary_role || user?.role || "creator");
  }, [user]);

  const roles = useMemo(() => {
    if (user?.roles && user.roles.length > 0) {
      return user.roles.map(normalizeRoleName);
    }
    return [primaryRole];
  }, [user, primaryRole]);

  const permissions = useMemo(() => {
    if (user?.permissions && user.permissions.length > 0) {
      return user.permissions;
    }
    return getDefaultPermissionsForRole(primaryRole);
  }, [user, primaryRole]);

  const hasRole = useCallback(
    (checkRole: string) => {
      const target = normalizeRoleName(checkRole);
      return roles.includes(target) || primaryRole === target;
    },
    [roles, primaryRole]
  );

  const hasPermission = useCallback(
    (permission: string) => {
      if (permissions.includes("admin:full_access")) return true;
      return permissions.includes(permission);
    },
    [permissions]
  );

  const isPro = useMemo(() => {
    return (
      hasRole("pro_creator") ||
      hasRole("verified_creator") ||
      hasRole("moderator") ||
      hasRole("admin") ||
      hasPermission("generation:create_pro")
    );
  }, [hasRole, hasPermission]);

  const isMod = useMemo(() => {
    return (
      hasRole("moderator") ||
      hasRole("admin") ||
      hasPermission("moderation:review_queue")
    );
  }, [hasRole, hasPermission]);

  const isAdmin = useMemo(() => {
    return hasRole("admin") || hasPermission("admin:full_access");
  }, [hasRole, hasPermission]);

  const switchRoleDemo = useCallback((newRole: UserRole) => {
    const updated = setLocalUserRole(newRole);
    if (updated) {
      setUser({ ...updated });
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      credits,
      token,
      isAuthenticated: Boolean(token && user),
      isLoading,
      isAuthModalOpen,
      authModalReason,
      primaryRole,
      roles,
      permissions,
      hasRole,
      hasPermission,
      isPro,
      isMod,
      isAdmin,
      switchRoleDemo,
      login,
      loginWithOAuth,
      register,
      logout,
      claimDaily,
      refreshCredits,
      forgotPassword,
      resetPassword,
      verifyEmail,
      resendVerification,
      openAuthModal,
      closeAuthModal,
    }),
    [
      user,
      credits,
      token,
      isLoading,
      isAuthModalOpen,
      authModalReason,
      primaryRole,
      roles,
      permissions,
      hasRole,
      hasPermission,
      isPro,
      isMod,
      isAdmin,
      switchRoleDemo,
      login,
      loginWithOAuth,
      register,
      logout,
      claimDaily,
      refreshCredits,
      forgotPassword,
      resetPassword,
      verifyEmail,
      resendVerification,
      openAuthModal,
      closeAuthModal,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

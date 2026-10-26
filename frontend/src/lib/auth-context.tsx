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
  type UpdateProfilePayload,
  type ChangePasswordPayload,
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
  switchRoleDemo: (role: UserRole) => Promise<void> | void;
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
  updateProfile: (payload: UpdateProfilePayload) => Promise<UserProfile>;
  uploadAvatar: (file: File) => Promise<string>;
  changePassword: (
    payload: ChangePasswordPayload
  ) => Promise<{ success: boolean; message: string }>;
  refreshUser: () => Promise<void>;
  openAuthModal: (reason?: string | unknown) => void;
  closeAuthModal: () => void;
  pendingReviewCount: number;
  refreshPendingReviewCount: () => Promise<void>;
  unreadNotificationCount: number;
  refreshUnreadNotificationCount: () => Promise<void>;
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

  const updateProfile = useCallback(
    async (payload: UpdateProfilePayload): Promise<UserProfile> => {
      const updated = await api.updateProfile(payload);
      setUser(updated);
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      return updated;
    },
    []
  );

  const uploadAvatar = useCallback(
    async (file: File): Promise<string> => {
      const res = await api.uploadAvatar(file);
      const updated = await api.updateProfile({ avatar_url: res.avatar_url });
      setUser(updated);
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      return res.avatar_url;
    },
    []
  );

  const changePassword = useCallback(
    async (payload: ChangePasswordPayload): Promise<{ success: boolean; message: string }> => {
      return api.changePassword(payload);
    },
    []
  );

  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const remote = await api.getMe();
      if (remote?.user) {
        setUser(remote.user);
        try {
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(remote.user));
        } catch {
          /* ignore */
        }
      }
      if (remote?.credits) {
        setCredits(remote.credits);
        try {
          localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(remote.credits));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const primaryRole = useMemo(() => {
    if (!token || !user) return "guest";
    return normalizeRoleName(user?.primary_role || user?.role || "creator");
  }, [token, user]);

  const roles = useMemo(() => {
    if (!token || !user) return ["guest"];
    if (user?.roles && user.roles.length > 0) {
      return user.roles.map(normalizeRoleName);
    }
    return [primaryRole];
  }, [token, user, primaryRole]);

  const permissions = useMemo(() => {
    if (!token || !user) return getDefaultPermissionsForRole("guest");
    if (user?.permissions && user.permissions.length > 0) {
      return user.permissions;
    }
    return getDefaultPermissionsForRole(primaryRole);
  }, [token, user, primaryRole]);

  const hasRole = useCallback(
    (checkRole: string) => {
      const target = normalizeRoleName(checkRole);
      return roles.includes(target) || primaryRole === target;
    },
    [roles, primaryRole]
  );

  const hasPermission = useCallback(
    (permission: string) => {
      if (!token || !user) return false;
      if (permissions.includes("admin:full_access")) return true;
      return permissions.includes(permission);
    },
    [token, user, permissions]
  );

  const isPro = useMemo(() => {
    if (!token || !user) return false;
    return (
      hasRole("pro_creator") ||
      hasRole("verified_creator") ||
      hasRole("moderator") ||
      hasRole("admin") ||
      hasPermission("generation:create_pro")
    );
  }, [token, user, hasRole, hasPermission]);

  const isMod = useMemo(() => {
    if (!token || !user) return false;
    return (
      hasRole("moderator") ||
      hasRole("admin") ||
      hasPermission("moderation:review_queue")
    );
  }, [token, user, hasRole, hasPermission]);

  const isAdmin = useMemo(() => {
    if (!token || !user) return false;
    return hasRole("admin") || hasPermission("admin:full_access");
  }, [token, user, hasRole, hasPermission]);

  const switchRoleDemo = useCallback(async (newRole: UserRole) => {
    const norm = normalizeRoleName(newRole);
    if (norm === "guest") {
      logout();
      setPendingReviewCount(0);
      return;
    }

    const DEMO_PERSONAS: Record<string, { username: string; password?: string }> = {
      creator: { username: "cyber_artisan", password: "Password123!" },
      moderator: { username: "sentinel_mod", password: "Password123!" },
      admin: { username: "winnguyen282", password: "Password123!" },
      pro_creator: { username: "neon_architect", password: "Password123!" },
      verified_creator: { username: "lora_mastermind", password: "Password123!" },
    };

    const persona = DEMO_PERSONAS[norm];
    if (persona) {
      try {
        const payload: LoginPayload = {
          emailOrUsername: persona.username,
          password: persona.password,
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
        if (norm === "moderator" || norm === "admin") {
          try {
            const queue = await api.getPendingModelsReviewQueue();
            setPendingReviewCount(queue?.total ?? queue?.items?.length ?? 0);
          } catch {
            /* ignore */
          }
        } else {
          setPendingReviewCount(0);
        }
        return;
      } catch (err) {
        console.warn("Backend auth for demo persona failed, falling back to local simulation:", err);
      }
    }

    const updated = setLocalUserRole(newRole);
    if (updated) {
      setUser({ ...updated });
    }
  }, []);

  const [pendingReviewCount, setPendingReviewCount] = useState<number>(0);

  const refreshPendingReviewCount = useCallback(async () => {
    if (!isMod && !isAdmin) {
      setPendingReviewCount(0);
      return;
    }
    try {
      const res = await api.getPendingModelsReviewQueue();
      setPendingReviewCount(res?.total ?? res?.items?.length ?? 0);
    } catch {
      /* ignore */
    }
  }, [isMod, isAdmin]);

  useEffect(() => {
    if (isMod || isAdmin) {
      void refreshPendingReviewCount();
      const interval = setInterval(() => {
        void refreshPendingReviewCount();
      }, 30000);
      return () => clearInterval(interval);
    } else {
      setPendingReviewCount(0);
    }
  }, [isMod, isAdmin, refreshPendingReviewCount]);

  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);

  const refreshUnreadNotificationCount = useCallback(async () => {
    if (!token && !user) {
      setUnreadNotificationCount(0);
      return;
    }
    try {
      const res = await api.getUnreadNotificationCount();
      setUnreadNotificationCount(res?.unread_count ?? 0);
    } catch {
      /* ignore */
    }
  }, [token, user]);

  useEffect(() => {
    if (token && user) {
      void refreshUnreadNotificationCount();
      const interval = setInterval(() => {
        void refreshUnreadNotificationCount();
      }, 30000);
      return () => clearInterval(interval);
    } else {
      setUnreadNotificationCount(0);
    }
  }, [token, user, refreshUnreadNotificationCount]);

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
      updateProfile,
      uploadAvatar,
      changePassword,
      refreshUser,
      openAuthModal,
      closeAuthModal,
      pendingReviewCount,
      refreshPendingReviewCount,
      unreadNotificationCount,
      refreshUnreadNotificationCount,
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
      updateProfile,
      uploadAvatar,
      changePassword,
      refreshUser,
      openAuthModal,
      closeAuthModal,
      pendingReviewCount,
      refreshPendingReviewCount,
      unreadNotificationCount,
      refreshUnreadNotificationCount,
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

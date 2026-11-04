"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  api,
  getAuthToken,
  setAuthToken,
  ApiError,
  AUTH_CREDITS_KEY,
  AUTH_USER_KEY,
  type CreditStatus,
  type LoginPayload,
  type RegisterPayload,
  type UserProfile,
  type UpdateProfilePayload,
  type ChangePasswordPayload,
  normalizeRoleName,
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
  login: (emailOrUsername: string, password?: string) => Promise<UserProfile>;
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

/** Unknown until the server reports a real balance; never a fabricated allowance. */
const EMPTY_CREDITS: CreditStatus = {
  balance: 0,
  dailyAllowance: 0,
  nextResetInSeconds: 0,
  lastClaimedAt: null,
};

/** Drop every client-side credit trace: never show one account's balance to the next. */
function clearStoredCredits() {
  try {
    localStorage.removeItem(AUTH_CREDITS_KEY);
  } catch {
    /* ignore */
  }
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditStatus>(EMPTY_CREDITS);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState<string | null>(null);

  // Bumped on login/register/logout/401. An in-flight /me response started under
  // an older session must never repopulate identity or credits for the new one.
  const sessionRef = useRef(0);
  const sessionIsCurrent = (session: number) => sessionRef.current === session;

  // Initialize from storage or backend session
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      const session = sessionRef.current;
      try {
        const storedToken = getAuthToken();
        const storedUser = localStorage.getItem(AUTH_USER_KEY);
        const storedCredits = localStorage.getItem(AUTH_CREDITS_KEY);

        let parsedCredits: CreditStatus = EMPTY_CREDITS;
        if (storedCredits) {
          try {
            parsedCredits = JSON.parse(storedCredits);
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
            if (mounted && sessionIsCurrent(session) && remoteSession?.user) {
              setUser(remoteSession.user);
              if (remoteSession.credits) {
                setCredits(remoteSession.credits);
                localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(remoteSession.credits));
              } else {
                setCredits(EMPTY_CREDITS);
                clearStoredCredits();
              }
              localStorage.setItem(AUTH_USER_KEY, JSON.stringify(remoteSession.user));
            }
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
              if (!mounted || !sessionIsCurrent(session)) return;
              sessionRef.current += 1;
              setAuthToken(null);
              setTokenState(null);
              setUser(null);
              setCredits(EMPTY_CREDITS);
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
          setCredits(EMPTY_CREDITS);
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

  // Cosmetic countdown toward the server-issued reset moment. The balance is
  // never recomputed here: only the credit service can grant credits.
  useEffect(() => {
    const timer = setInterval(() => {
      setCredits((prev) =>
        prev.nextResetInSeconds > 0
          ? { ...prev, nextResetInSeconds: prev.nextResetInSeconds - 1 }
          : prev
      );
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
      sessionRef.current += 1;
      const session = sessionRef.current;
      const response = await api.login(payload);
      if (!sessionIsCurrent(session)) return response.user;
      setAuthToken(response.token);
      setTokenState(response.token);
      setUser(response.user);
      if (response.credits) {
        setCredits(response.credits);
        try {
          localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(response.credits));
        } catch {
          /* ignore */
        }
      } else {
        setCredits(EMPTY_CREDITS);
        clearStoredCredits();
      }
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
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
      sessionRef.current += 1;
      const session = sessionRef.current;
      const response = await api.register(payload);
      if (!sessionIsCurrent(session)) return response.user;
      setAuthToken(response.token);
      setTokenState(response.token);
      setUser(response.user);
      if (response.credits) {
        setCredits(response.credits);
        try {
          localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(response.credits));
        } catch {
          /* ignore */
        }
      } else {
        setCredits(EMPTY_CREDITS);
        clearStoredCredits();
      }
      try {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
      } catch {
        /* ignore */
      }
      setIsAuthModalOpen(false);
      return response.user;
    },
    []
  );

  const logout = useCallback(() => {
    sessionRef.current += 1;
    setAuthToken(null);
    setTokenState(null);
    setUser(null);
    setCredits(EMPTY_CREDITS);
    clearStoredCredits();
    try {
      localStorage.removeItem(AUTH_USER_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshCredits = useCallback(async () => {
    const session = sessionRef.current;
    try {
      const remote = await api.getMe();
      if (!sessionIsCurrent(session)) return;
      if (remote?.credits) {
        setCredits(remote.credits);
        localStorage.setItem(AUTH_CREDITS_KEY, JSON.stringify(remote.credits));
      } else {
        setCredits(EMPTY_CREDITS);
        clearStoredCredits();
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
    const session = sessionRef.current;
    try {
      const remote = await api.getMe();
      if (!sessionIsCurrent(session)) return;
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
      } else {
        setCredits(EMPTY_CREDITS);
        clearStoredCredits();
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
    if (!token || !user) return [];
    return user.permissions ?? [];
  }, [token, user]);

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
      login,
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
      login,
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

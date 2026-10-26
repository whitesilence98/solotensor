"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import Link from "next/link";
import {
  User,
  Shield,
  SlidersHorizontal,
  Key,
  Zap,
  Bell,
  RotateCcw,
  Check,
  Copy,
  Trash2,
  Plus,
  Upload,
  ExternalLink,
  Lock,
  AlertCircle,
  CheckCircle2,
  Volume2,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  LogOut,
  Flame,
} from "lucide-react";
import {
  DEFAULT_SETTINGS,
  SETTING_FORMATS,
  loadSettings,
  resetSettings,
  saveSettings,
  type StudioSettings,
} from "@/lib/settings";
import { useAuth } from "@/lib/auth-context";
import {
  api,
  type ApiKeyListItem,
  type ApiKeyResponse,
  resolveMediaUrl,
} from "@/lib/api";
import WorkspaceFooter from "@/components/WorkspaceFooter";
import CreditPill from "@/components/CreditPill";
import WorkspaceNavbar from "@/components/WorkspaceNavbar";
import CustomSelect from "@/components/CustomSelect";
import AspectRatioSelector from "@/components/AspectRatioSelector";
import UserAvatar from "@/components/UserAvatar";

type SettingsTab =
  | "profile"
  | "security"
  | "studio"
  | "keys"
  | "credits"
  | "preferences";

const TABS: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile & Identity", icon: User },
  { id: "security", label: "Account & Security", icon: Shield },
  { id: "studio", label: "Studio Defaults", icon: SlidersHorizontal },
  { id: "keys", label: "Developer & API Keys", icon: Key },
  { id: "credits", label: "Credits & Quotas", icon: Zap },
  { id: "preferences", label: "Preferences", icon: Bell },
];

const SAMPLER_OPTIONS = [
  { value: "euler", label: "Euler (Standard / Fast)" },
  { value: "dpmpp_2m", label: "DPM++ 2M (High Fidelity)" },
  { value: "euler_ancestral", label: "Euler Ancestral (Creative Stochastic)" },
  { value: "uni_pc", label: "UniPC (Fast Convergence)" },
  { value: "lcm", label: "LCM (Latent Consistency Fast)" },
  { value: "heun", label: "Heun (High Accuracy)" },
];

const SCHEDULER_OPTIONS = [
  { value: "normal", label: "Normal (Standard linear schedule)" },
  { value: "karras", label: "Karras (Variance-preserving noise)" },
  { value: "exponential", label: "Exponential (Deep dynamic range)" },
  { value: "simple", label: "Simple (Uniform decay)" },
  { value: "sgm_uniform", label: "SGM Uniform" },
];

const fieldLabel = "text-[11px] font-bold text-[var(--ink-soft)] uppercase tracking-wider font-mono";
const fieldHelp = "mt-1.5 block text-xs leading-5 text-[var(--ink-faint)]";

export default function SettingsPage() {
  const {
    user,
    token,
    credits,
    isAuthenticated,
    isPro,
    isMod,
    isAdmin,
    primaryRole,
    updateProfile,
    uploadAvatar,
    changePassword,
    resendVerification,
    claimDaily,
    refreshCredits,
    openAuthModal,
    logout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [status, setStatus] = useState("Configured");

  // Studio Settings (local + extended)
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [previousSettings, setPreviousSettings] = useState<StudioSettings | null>(null);

  // Profile Edit State
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({
    civitai: "",
    twitter: "",
    github: "",
    huggingface: "",
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Account & Security State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  // Developer API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKeyListItem[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [isCreateKeyModalOpen, setIsCreateKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState<ApiKeyResponse | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  // Daily Claim State
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimStatus, setClaimStatus] = useState<string | null>(null);

  // Load local settings on mount
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // Sync profile form fields when auth user changes
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || user.username || "");
      setBio(user.bio || "");
      setSocialLinks({
        civitai: user.social_links?.civitai || "",
        twitter: user.social_links?.twitter || "",
        github: user.social_links?.github || "",
        huggingface: user.social_links?.huggingface || "",
      });
      setAvatarPreview(user.avatarUrl ? resolveMediaUrl(user.avatarUrl) : null);
    }
  }, [user]);

  // Load API keys when switching to keys tab
  useEffect(() => {
    if (activeTab === "keys" && isAuthenticated) {
      setIsLoadingKeys(true);
      api
        .listApiKeys()
        .then((keys) => setApiKeys(keys))
        .catch(() => setApiKeys([]))
        .finally(() => setIsLoadingKeys(false));
    }
  }, [activeTab, isAuthenticated]);

  // Studio Settings Mutators
  const updateSetting = <Key extends keyof StudioSettings>(
    key: Key,
    value: StudioSettings[Key]
  ) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    const ok = saveSettings(next);
    setStatus(ok ? "Saved locally" : "Storage full");
  };

  const handleResetSettings = () => {
    setPreviousSettings(settings);
    setSettings(DEFAULT_SETTINGS);
    setStatus(resetSettings() ? "Reset defaults" : "Reset failed");
  };

  const undoResetSettings = () => {
    if (!previousSettings) return;
    setSettings(previousSettings);
    setStatus(saveSettings(previousSettings) ? "Restored" : "Failed");
    setPreviousSettings(null);
  };

  // Avatar Selection Handlers
  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setProfileStatus({ type: "error", text: "Image exceeds 5MB limit." });
      return;
    }
    setAvatarFile(file);
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
    setProfileStatus(null);
  };

  const handleRemoveAvatar = async () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (isAuthenticated) {
      try {
        await updateProfile({ avatar_url: "" });
        setProfileStatus({ type: "success", text: "Avatar removed." });
      } catch {
        setProfileStatus({ type: "error", text: "Could not remove avatar." });
      }
    }
  };

  // Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      openAuthModal("Sign in to save and sync your profile.");
      return;
    }

    setIsSavingProfile(true);
    setProfileStatus(null);

    try {
      let finalAvatarUrl: string | undefined = undefined;
      if (avatarFile) {
        finalAvatarUrl = await uploadAvatar(avatarFile);
      }

      const linksPayload: Record<string, string> = {};
      Object.entries(socialLinks).forEach(([k, v]) => {
        if (v && v.trim()) linksPayload[k] = v.trim();
      });

      await updateProfile({
        display_name: displayName.trim(),
        avatar_url: finalAvatarUrl,
        bio: bio.trim(),
        social_links: linksPayload,
      });

      setProfileStatus({ type: "success", text: "Profile updated successfully." });
      setStatus("Profile synced");
    } catch (err: any) {
      setProfileStatus({
        type: "error",
        text: err?.message || "Failed to update profile.",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) return;
    if (newPassword.length < 8) {
      setPasswordStatus({ type: "error", text: "Password must be at least 8 characters long." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", text: "New passwords do not match." });
      return;
    }

    setIsChangingPassword(true);
    setPasswordStatus(null);

    try {
      const res = await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordStatus({ type: "success", text: res.message || "Password updated successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordStatus({
        type: "error",
        text: err?.message || "Incorrect current password or server rejection.",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Resend Email Verification
  const handleResendVerification = async () => {
    setIsResending(true);
    setResendStatus(null);
    try {
      const res = await resendVerification();
      setResendStatus(res.message);
    } catch (err: any) {
      setResendStatus(err?.message || "Could not dispatch verification email.");
    } finally {
      setIsResending(false);
    }
  };

  // Daily Energy Claim
  const handleClaimDailyEnergy = async () => {
    setIsClaiming(true);
    setClaimStatus(null);
    try {
      const res = await claimDaily();
      setClaimStatus(res.message);
    } catch (err: any) {
      setClaimStatus(err?.message || "Could not claim energy.");
    } finally {
      setIsClaiming(false);
    }
  };

  // Developer API Key Actions
  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setIsCreatingKey(true);
    try {
      const created = await api.createApiKey(newKeyName.trim());
      setRevealedKey(created);
      setApiKeys((prev) => [
        {
          id: created.id,
          user_id: created.user_id,
          name: created.name,
          created_at: created.created_at,
          masked_key: `st_live_••••${created.api_key ? created.api_key.slice(-4) : "key"}`,
        },
        ...prev,
      ]);
      setNewKeyName("");
      setIsCreateKeyModalOpen(false);
    } catch (err: any) {
      alert(err?.message || "Could not generate API key.");
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? This action is permanent.")) {
      return;
    }
    setDeletingKeyId(keyId);
    try {
      await api.deleteApiKey(keyId);
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (err: any) {
      alert(err?.message || "Failed to revoke key.");
    } finally {
      setDeletingKeyId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2500);
  };

  // Clear Studio Cache (Danger Zone)
  const handleClearCache = () => {
    if (confirm("Clear local generator drafts, cached seeds, and settings? This does not delete account data.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <main
      id="main-content"
      className="workspace-scroll flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--ground)] antialiased"
    >
      <WorkspaceNavbar
        subtitle="STUDIO CONFIGURATION &amp; PREFERENCES"
        href="/settings"
        maxWidth="max-w-5xl"
        statusText={status}
        actions={
          <div className="flex items-center gap-2">
            <CreditPill />
            {previousSettings && (
              <button
                type="button"
                onClick={undoResetSettings}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2.5 font-mono text-[11px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Undo Reset</span>
              </button>
            )}
          </div>
        }
      />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8">
        {/* Header */}
        <header className="border-b border-[var(--line)] pb-5 md:pb-6">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="workspace-title">Settings &amp; Preferences</h1>
              {user && (
                <Link
                  href={`/user/${encodeURIComponent(user.username)}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 font-mono text-xs text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--ink)] transition-colors"
                >
                  <span>View Public Profile</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
            <p className="workspace-copy">
              Manage your creator profile, generator defaults, developer access tokens, and studio preferences.
            </p>
          </div>
        </header>

        {/* Guest Banner if not authenticated */}
        {!isAuthenticated && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                Operating in <strong>Guest Mode</strong>. Generator preferences are stored on this machine. Sign in to sync your profile across devices and manage API keys.
              </span>
            </div>
            <button
              type="button"
              onClick={() => openAuthModal("Sign in to sync your profile and access API keys")}
              className="inline-flex shrink-0 items-center justify-center rounded border border-amber-500/50 bg-amber-500/20 px-3 py-1 font-mono text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition-colors"
            >
              Sign In / Register
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mt-6 flex items-center gap-1 overflow-x-auto border-b border-[var(--line)] pb-px workspace-scroll">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--surface-raised)]"
                    : "border-transparent text-[var(--ink-soft)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: Profile & Identity */}
        {activeTab === "profile" && (
          <section className="workspace-bezel mt-6 p-6 md:p-8" aria-label="Profile and Identity">
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="border-b border-[var(--line)] pb-4">
                <h2 className="text-base font-semibold text-[var(--ink)]">Public Creator Persona</h2>
                <p className="mt-1 text-xs text-[var(--ink-faint)]">
                  This identity is displayed on your public gallery, model uploads, and profile page.
                </p>
              </div>

              {profileStatus && (
                <div
                  className={`flex items-center gap-2 rounded-md p-3 text-xs font-medium ${
                    profileStatus.type === "success"
                      ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
                  }`}
                >
                  {profileStatus.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{profileStatus.text}</span>
                </div>
              )}

              {/* Avatar Section */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 pb-6 border-b border-[var(--line)]">
                <div className="relative shrink-0">
                  <UserAvatar
                    src={avatarPreview}
                    name={displayName || user?.username || "Solo Creator"}
                    role={primaryRole}
                    size="2xl"
                    shape="circle"
                    showRoleRing
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleAvatarFileSelect}
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 font-mono text-xs font-medium text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Avatar</span>
                    </button>
                    {avatarPreview && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 font-mono text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--ink-faint)]">
                    Square PNG, JPEG, or WebP. Max 5MB. Stored within your protected user namespace.
                  </p>
                </div>
              </div>

              {/* Display Name & Handle */}
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="display-name" className={fieldLabel}>
                    Display Name
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    maxLength={80}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Elena Rostova"
                    className="workspace-field mt-1.5 w-full px-3 py-2 text-sm outline-none"
                  />
                  <span className={fieldHelp}>Visible to all studio visitors.</span>
                </div>

                <div>
                  <label htmlFor="username-handle" className={fieldLabel}>
                    Username Handle
                  </label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3 top-2 text-xs font-mono text-[var(--ink-faint)]">@</span>
                    <input
                      id="username-handle"
                      type="text"
                      disabled
                      value={user?.username || "guest"}
                      className="workspace-field w-full pl-7 pr-3 py-2 text-sm text-[var(--ink-faint)] bg-[var(--surface-sunken)] cursor-not-allowed outline-none"
                    />
                  </div>
                  <span className={fieldHelp}>Fixed unique username handle.</span>
                </div>
              </div>

              {/* Bio */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="bio-textarea" className={fieldLabel}>
                    Creator Bio / Headline
                  </label>
                  <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                    {bio.length} / 500
                  </span>
                </div>
                <textarea
                  id="bio-textarea"
                  rows={3}
                  maxLength={500}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell the community about your workflows, model specialties, or visual art style…"
                  className="workspace-field mt-1.5 w-full p-3 text-sm outline-none"
                />
              </div>

              {/* Social Links */}
              <div className="border-t border-[var(--line)] pt-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)] font-mono">
                  Social &amp; Platform Presence
                </h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="social-civitai" className="block text-[11px] font-mono text-[var(--ink-faint)]">
                      Civitai Profile
                    </label>
                    <input
                      id="social-civitai"
                      type="text"
                      value={socialLinks.civitai || ""}
                      onChange={(e) =>
                        setSocialLinks({ ...socialLinks, civitai: e.target.value })
                      }
                      placeholder="https://civitai.com/user/yourname"
                      className="workspace-field mt-1 w-full px-3 py-2 font-mono text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="social-twitter" className="block text-[11px] font-mono text-[var(--ink-faint)]">
                      X / Twitter
                    </label>
                    <input
                      id="social-twitter"
                      type="text"
                      value={socialLinks.twitter || ""}
                      onChange={(e) =>
                        setSocialLinks({ ...socialLinks, twitter: e.target.value })
                      }
                      placeholder="https://x.com/yourname"
                      className="workspace-field mt-1 w-full px-3 py-2 font-mono text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="social-github" className="block text-[11px] font-mono text-[var(--ink-faint)]">
                      GitHub
                    </label>
                    <input
                      id="social-github"
                      type="text"
                      value={socialLinks.github || ""}
                      onChange={(e) =>
                        setSocialLinks({ ...socialLinks, github: e.target.value })
                      }
                      placeholder="https://github.com/yourname"
                      className="workspace-field mt-1 w-full px-3 py-2 font-mono text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="social-hf" className="block text-[11px] font-mono text-[var(--ink-faint)]">
                      Hugging Face
                    </label>
                    <input
                      id="social-hf"
                      type="text"
                      value={socialLinks.huggingface || ""}
                      onChange={(e) =>
                        setSocialLinks({ ...socialLinks, huggingface: e.target.value })
                      }
                      placeholder="https://huggingface.co/yourname"
                      className="workspace-field mt-1 w-full px-3 py-2 font-mono text-xs outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Profile */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--line)]">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 font-mono text-xs font-bold text-black hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {isSavingProfile ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Save Profile Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* TAB 2: Account & Security */}
        {activeTab === "security" && (
          <div className="mt-6 space-y-6" aria-label="Account and Security">
            {/* Email & Status */}
            <section className="workspace-bezel p-6 md:p-8">
              <h2 className="text-base font-semibold text-[var(--ink)]">Email &amp; Verification</h2>
              <p className="mt-1 text-xs text-[var(--ink-faint)]">
                Your email is used for password recovery and critical studio alerts.
              </p>

              <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-4">
                <div className="space-y-1">
                  <span className="block font-mono text-xs font-semibold text-[var(--ink)]">
                    {user?.email || "guest@solotensor.local"}
                  </span>
                  <div className="flex items-center gap-2">
                    {user?.is_verified ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-400">
                        <AlertCircle className="h-3 w-3" />
                        Unverified
                      </span>
                    )}
                  </div>
                </div>

                {!user?.is_verified && isAuthenticated && (
                  <button
                    type="button"
                    disabled={isResending}
                    onClick={handleResendVerification}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 font-mono text-xs font-medium text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50 transition-colors"
                  >
                    {isResending ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
                    <span>Resend Verification Email</span>
                  </button>
                )}
              </div>

              {resendStatus && (
                <p className="mt-3 text-xs text-emerald-400 font-mono">
                  {resendStatus}
                </p>
              )}
            </section>

            {/* Change Password */}
            {isAuthenticated && (
              <section className="workspace-bezel p-6 md:p-8">
                <h2 className="text-base font-semibold text-[var(--ink)]">Change Password</h2>
                <p className="mt-1 text-xs text-[var(--ink-faint)]">
                  Use a strong password with at least 8 characters.
                </p>

                {passwordStatus && (
                  <div
                    className={`mt-4 flex items-center gap-2 rounded-md p-3 text-xs font-medium ${
                      passwordStatus.type === "success"
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
                    }`}
                  >
                    {passwordStatus.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span>{passwordStatus.text}</span>
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="mt-5 space-y-4 max-w-md">
                  <div>
                    <label htmlFor="current-pw" className={fieldLabel}>
                      Current Password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="current-pw"
                        type={showPassword ? "text" : "password"}
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="workspace-field w-full px-3 py-2 pr-9 text-sm outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="new-pw" className={fieldLabel}>
                      New Password
                    </label>
                    <input
                      id="new-pw"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="workspace-field mt-1.5 w-full px-3 py-2 text-sm outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirm-pw" className={fieldLabel}>
                      Confirm New Password
                    </label>
                    <input
                      id="confirm-pw"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="workspace-field mt-1.5 w-full px-3 py-2 text-sm outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="mt-2 inline-flex items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-4 py-2 font-mono text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50 transition-colors"
                  >
                    {isChangingPassword ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                    <span>Update Password</span>
                  </button>
                </form>
              </section>
            )}

            {/* Danger Zone */}
            <section className="rounded-xl border border-rose-500/30 bg-rose-500/[0.04] p-6 md:p-8">
              <h2 className="text-base font-semibold text-rose-400">Danger Zone</h2>
              <p className="mt-1 text-xs text-[var(--ink-faint)]">
                Local storage maintenance and active session teardown.
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-rose-500/20">
                <div>
                  <span className="block text-xs font-bold text-[var(--ink)]">Clear Local Studio Cache</span>
                  <span className="text-[11px] text-[var(--ink-faint)]">
                    Flushes saved client prompts, offline tokens, and draft generations.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClearCache}
                  className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors"
                >
                  Clear Local Cache
                </button>
              </div>

              {isAuthenticated && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-rose-500/20">
                  <div>
                    <span className="block text-xs font-bold text-[var(--ink)]">Sign Out of SoloTensor</span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      Terminates current session token on this browser.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 font-mono text-xs font-semibold text-[var(--ink)] hover:border-rose-500 hover:text-rose-400 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 3: Studio & Generation Defaults */}
        {activeTab === "studio" && (
          <div className="mt-6 space-y-6" aria-label="Studio Generation Defaults">
            <section className="workspace-bezel p-6 md:p-8">
              <div className="border-b border-[var(--line)] pb-4">
                <h2 className="text-base font-semibold text-[var(--ink)]">Generator Defaults</h2>
                <p className="mt-1 text-xs text-[var(--ink-faint)]">
                  These initial values configure new generation sessions. Modifying them does not alter existing workflow runs.
                </p>
              </div>

              <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,.8fr)] lg:gap-10">
                {/* Aspect Ratio */}
                <div>
                  <AspectRatioSelector
                    id="default-format"
                    value={settings.defaultFormat}
                    onChange={(val) =>
                      updateSetting(
                        "defaultFormat",
                        val as StudioSettings["defaultFormat"]
                      )
                    }
                    options={SETTING_FORMATS}
                    label="Default Aspect Ratio Format"
                    size="md"
                  />
                  <span id="default-format-help" className={fieldHelp}>
                    Aspect ratio sets default canvas dimensions across Text-to-Image and Img2Img.
                  </span>
                </div>

                {/* Steps and Count */}
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                  <label className="block" htmlFor="default-steps">
                    <span className={fieldLabel}>Default Steps ({settings.defaultSteps})</span>
                    <input
                      id="default-steps"
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={settings.defaultSteps}
                      onChange={(e) =>
                        updateSetting(
                          "defaultSteps",
                          Math.min(100, Math.max(1, Number(e.target.value) || 1))
                        )
                      }
                      className="workspace-field mt-1.5 w-full px-3 py-2 text-sm outline-none"
                    />
                    <span className={fieldHelp}>Standard denoising step count (10-30 recommended).</span>
                  </label>

                  <label className="block" htmlFor="default-image-count">
                    <span className={fieldLabel}>Images per Run ({settings.defaultImageCount})</span>
                    <input
                      id="default-image-count"
                      type="number"
                      min={1}
                      max={4}
                      step={1}
                      value={settings.defaultImageCount}
                      onChange={(e) =>
                        updateSetting(
                          "defaultImageCount",
                          Math.min(4, Math.max(1, Number(e.target.value) || 1))
                        )
                      }
                      className="workspace-field mt-1.5 w-full px-3 py-2 text-sm outline-none"
                    />
                    <span className={fieldHelp}>Batch generation size (up to 4 parallel latents).</span>
                  </label>
                </div>
              </div>

              {/* Sampler & Scheduler Selection */}
              <div className="mt-8 pt-6 border-t border-[var(--line)] grid gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="default-sampler" className={fieldLabel}>
                    Default KSampler
                  </label>
                  <div className="mt-1.5">
                    <CustomSelect
                      id="default-sampler"
                      value={settings.defaultSampler || "euler"}
                      onChange={(val) => updateSetting("defaultSampler", val)}
                      options={SAMPLER_OPTIONS}
                    />
                  </div>
                  <span className={fieldHelp}>Denoising solver algorithm.</span>
                </div>

                <div>
                  <label htmlFor="default-scheduler" className={fieldLabel}>
                    Default Scheduler
                  </label>
                  <div className="mt-1.5">
                    <CustomSelect
                      id="default-scheduler"
                      value={settings.defaultScheduler || "normal"}
                      onChange={(val) => updateSetting("defaultScheduler", val)}
                      options={SCHEDULER_OPTIONS}
                    />
                  </div>
                  <span className={fieldHelp}>Variance noise decay rate schedule.</span>
                </div>
              </div>

              {/* Privacy and Live Previews */}
              <div className="mt-8 pt-6 border-t border-[var(--line)] space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.defaultPrivacy)}
                    onChange={(e) => updateSetting("defaultPrivacy", e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)] focus:ring-0"
                  />
                  <div>
                    <span className="block text-xs font-bold text-[var(--ink)]">
                      Private Generations by Default
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      Automatically mark generations as unlisted so they do not surface in community explore feeds.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.streamPreviews)}
                    onChange={(e) => updateSetting("streamPreviews", e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)] focus:ring-0"
                  />
                  <div>
                    <span className="block text-xs font-bold text-[var(--ink)]">
                      Live Latent WebSocket Previews
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      Stream progressive visual preview frames during step execution.
                    </span>
                  </div>
                </label>
              </div>

              {/* Reset Defaults button */}
              <div className="mt-8 pt-4 border-t border-[var(--line)] flex items-center justify-between">
                <span className="text-xs text-[var(--ink-faint)]">
                  Stored locally in browser configuration storage.
                </span>
                <button
                  type="button"
                  onClick={handleResetSettings}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 py-1.5 font-mono text-xs font-semibold text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset to Factory Defaults</span>
                </button>
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: Developer & API Keys */}
        {activeTab === "keys" && (
          <div className="mt-6 space-y-6" aria-label="Developer and API Keys">
            <section className="workspace-bezel p-6 md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
                <div>
                  <h2 className="text-base font-semibold text-[var(--ink)]">Personal Access Tokens</h2>
                  <p className="mt-1 text-xs text-[var(--ink-faint)]">
                    Generate API tokens to programmatically execute workflows, query models, and trigger headless pipelines.
                  </p>
                </div>
                {isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => setIsCreateKeyModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 py-1.5 font-mono text-xs font-bold text-black hover:opacity-90 transition-opacity"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create New Key</span>
                  </button>
                )}
              </div>

              {/* One-Time Secret Disclosure Box */}
              {revealedKey && (
                <div className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Key Generated: &quot;{revealedKey.name}&quot;</span>
                  </div>
                  <p className="mt-1 text-[11px] text-emerald-300/80">
                    Copy your secret token now. You will not be able to view it again.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={revealedKey.api_key || ""}
                      className="workspace-field flex-1 px-3 py-1.5 font-mono text-xs text-emerald-300 bg-black/40 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        revealedKey.api_key && copyToClipboard(revealedKey.api_key, revealedKey.id)
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                    >
                      {copiedKeyId === revealedKey.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedKeyId === revealedKey.id ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* API Keys Table */}
              <div className="mt-5">
                {isLoadingKeys ? (
                  <div className="py-8 text-center font-mono text-xs text-[var(--ink-faint)]">
                    Loading credentials…
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center">
                    <Key className="mx-auto h-8 w-8 text-[var(--ink-faint)]" />
                    <p className="mt-2 text-xs font-semibold text-[var(--ink)]">No API Keys Generated</p>
                    <p className="text-[11px] text-[var(--ink-faint)]">
                      Create an API key to authenticate Python scripts or local agent sidecars.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="border-b border-[var(--line)] bg-[var(--surface-sunken)] text-[10px] uppercase text-[var(--ink-faint)]">
                        <tr>
                          <th className="px-4 py-2.5">Name</th>
                          <th className="px-4 py-2.5">Key Prefix</th>
                          <th className="px-4 py-2.5">Created</th>
                          <th className="px-4 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        {apiKeys.map((k) => (
                          <tr key={k.id} className="hover:bg-[var(--surface-raised)] transition-colors">
                            <td className="px-4 py-3 font-semibold text-[var(--ink)]">{k.name}</td>
                            <td className="px-4 py-3 text-[var(--ink-soft)] font-mono">
                              {k.masked_key || "st_live_••••"}
                            </td>
                            <td className="px-4 py-3 text-[var(--ink-faint)]">
                              {new Date(k.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                disabled={deletingKeyId === k.id}
                                onClick={() => handleDeleteApiKey(k.id)}
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>Revoke</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Quickstart Documentation Snippet */}
              <div className="mt-8 pt-6 border-t border-[var(--line)]">
                <span className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)] font-mono">
                  Quickstart Integration Snippet
                </span>
                <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
                  Pass your key as a Bearer authorization header to any SoloTensor endpoint:
                </p>
                <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-3 font-mono text-xs text-[var(--ink)] overflow-x-auto">
                  <code>
                    curl -X POST &quot;http://localhost:8000/api/v1/generate&quot; \<br />
                    &nbsp;&nbsp;-H &quot;Authorization: Bearer st_live_YOUR_SECRET_KEY&quot; \<br />
                    &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
                    &nbsp;&nbsp;-d &apos;{JSON.stringify({ prompt: "cyberpunk skyline", steps: 20 })}&apos;
                  </code>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 5: Credits & Quotas */}
        {activeTab === "credits" && (
          <div className="mt-6 space-y-6" aria-label="Credits and Resource Quotas">
            <section className="workspace-bezel p-6 md:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
                <div>
                  <h2 className="text-base font-semibold text-[var(--ink)]">Daily Credit Pool</h2>
                  <p className="mt-1 text-xs text-[var(--ink-faint)]">
                    Credits power generation jobs, latent upscaling, and tool graph interpolations.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[var(--accent)]/10 px-2.5 py-1 font-mono text-xs font-bold text-[var(--accent)]">
                    Role: {primaryRole.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Balance Box */}
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-5">
                  <span className="text-[11px] font-mono text-[var(--ink-faint)] uppercase">Current Balance</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-extrabold text-[var(--ink)]">
                      {credits.balance}
                    </span>
                    <span className="font-mono text-xs text-[var(--ink-soft)]">
                      / {credits.dailyAllowance} cr
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface)]">
                    <div
                      className="h-full bg-[var(--accent)] transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(0, (credits.balance / credits.dailyAllowance) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-5">
                  <span className="text-[11px] font-mono text-[var(--ink-faint)] uppercase">Reset Countdown</span>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-bold text-[var(--ink)]">
                      {Math.floor(credits.nextResetInSeconds / 3600)}h{" "}
                      {Math.floor((credits.nextResetInSeconds % 3600) / 60)}m
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--ink-faint)]">
                    Refreshes automatically at 00:00 UTC daily.
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] p-5 flex flex-col justify-between">
                  <span className="text-[11px] font-mono text-[var(--ink-faint)] uppercase">Daily Energy Drop</span>
                  <button
                    type="button"
                    disabled={isClaiming || credits.balance >= credits.dailyAllowance}
                    onClick={handleClaimDailyEnergy}
                    className="mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 font-mono text-xs font-bold text-black hover:opacity-90 disabled:opacity-40 transition-all"
                  >
                    {isClaiming ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
                    <span>{credits.balance >= credits.dailyAllowance ? "Energy Full" : "Claim Daily Bonus"}</span>
                  </button>
                  {claimStatus && (
                    <span className="mt-2 block text-[10px] text-emerald-400 font-mono">
                      {claimStatus}
                    </span>
                  )}
                </div>
              </div>

              {/* Cost Matrix */}
              <div className="mt-8 pt-6 border-t border-[var(--line)]">
                <span className="block text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)] font-mono">
                  Standard Feature Cost Schedule
                </span>
                <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)]">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="border-b border-[var(--line)] bg-[var(--surface-sunken)] text-[10px] uppercase text-[var(--ink-faint)]">
                      <tr>
                        <th className="px-4 py-2.5">Feature Primitive</th>
                        <th className="px-4 py-2.5">Pipeline Cost</th>
                        <th className="px-4 py-2.5">Execution Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--ink)]">Text-to-Image Generation</td>
                        <td className="px-4 py-3 text-[var(--accent)] font-bold">2 Credits</td>
                        <td className="px-4 py-3 text-[var(--ink-faint)]">Standard DiT / SDXL checkpoint run</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--ink)]">Chained Image-to-Image</td>
                        <td className="px-4 py-3 text-[var(--accent)] font-bold">2 Credits</td>
                        <td className="px-4 py-3 text-[var(--ink-faint)]">Latent conditioning from source asset</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--ink)]">SeedVR2 Latent Upscaler</td>
                        <td className="px-4 py-3 text-[var(--accent)] font-bold">1 Credit</td>
                        <td className="px-4 py-3 text-[var(--ink-faint)]">2x High-resolution detail reconstruction</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--ink)]">Face &amp; Hand Detailer</td>
                        <td className="px-4 py-3 text-[var(--accent)] font-bold">1 Credit</td>
                        <td className="px-4 py-3 text-[var(--ink-faint)]">Bbox detector + micro-denoising pass</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 font-semibold text-[var(--ink)]">Custom Parametric AI Tool</td>
                        <td className="px-4 py-3 text-[var(--accent)] font-bold">1–3 Credits</td>
                        <td className="px-4 py-3 text-[var(--ink-faint)]">Depends on node complexity &amp; outputs</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 6: Preferences */}
        {activeTab === "preferences" && (
          <div className="mt-6 space-y-6" aria-label="Interface and Notification Preferences">
            <section className="workspace-bezel p-6 md:p-8">
              <div className="border-b border-[var(--line)] pb-4">
                <h2 className="text-base font-semibold text-[var(--ink)]">Interface &amp; Notification Preferences</h2>
                <p className="mt-1 text-xs text-[var(--ink-faint)]">
                  Tune audio cues and studio layout behavior.
                </p>
              </div>

              <div className="mt-6 space-y-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.soundChime)}
                    onChange={(e) => updateSetting("soundChime", e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--line-strong)] bg-[var(--surface)] text-[var(--accent)] focus:ring-0"
                  />
                  <div>
                    <span className="block text-xs font-bold text-[var(--ink)]">
                      Completion Audio Chime
                    </span>
                    <span className="text-[11px] text-[var(--ink-faint)]">
                      Plays a subtle chime tone when long-running workflows complete in the background.
                    </span>
                  </div>
                </label>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* API Key Creation Modal */}
      {isCreateKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--ink)]">Create Developer API Key</h3>
            <p className="mt-1 text-xs text-[var(--ink-faint)]">
              Enter a friendly label for this key to identify its purpose.
            </p>

            <form onSubmit={handleCreateApiKey} className="mt-4 space-y-4">
              <div>
                <label htmlFor="key-name-input" className={fieldLabel}>
                  Key Name
                </label>
                <input
                  id="key-name-input"
                  type="text"
                  required
                  autoFocus
                  maxLength={100}
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. ComfyUI Local Worker or Automation Bot"
                  className="workspace-field mt-1.5 w-full px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateKeyModalOpen(false)}
                  className="rounded-md px-3 py-1.5 font-mono text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingKey || !newKeyName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3.5 py-1.5 font-mono text-xs font-bold text-black hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isCreatingKey ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  <span>Generate Key</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <WorkspaceFooter containerClassName="max-w-5xl" />
    </main>
  );
}

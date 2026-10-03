"use client";

import { useEffect, useState } from "react";
import { Check, RotateCcw, Settings2, SlidersHorizontal } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  SETTING_FORMATS,
  loadSettings,
  resetSettings,
  saveSettings,
  type StudioSettings,
} from "@/lib/settings";

const formatLabels: Record<StudioSettings["defaultFormat"], string> = {
  "1:1": "Square · 1024 × 1024",
  "16:9": "Landscape · 1344 × 768",
  "9:16": "Portrait · 768 × 1344",
  "4:3": "Classic · 1152 × 896",
  "3:2": "Wide · 1216 × 832",
};

const fieldLabel = "text-[11px] font-bold uppercase tracking-[.14em] text-[#aaa8a1]";
const fieldHelp = "mt-2 block text-xs leading-5 text-[#6f716d]";

export default function SettingsPage() {
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState("Loading settings…");
  const [previousSettings, setPreviousSettings] = useState<StudioSettings | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
    setStatus("Saved locally");
  }, []);

  const updateSetting = <Key extends keyof StudioSettings>(key: Key, value: StudioSettings[Key]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    setStatus(saveSettings(next) ? "Saved locally" : "Could not save settings locally");
  };

  const handleReset = () => {
    setPreviousSettings(settings);
    setSettings(DEFAULT_SETTINGS);
    setStatus(resetSettings() ? "Settings reset. Undo is available." : "Could not save the reset locally");
  };

  const undoReset = () => {
    if (!previousSettings) return;
    setSettings(previousSettings);
    setStatus(saveSettings(previousSettings) ? "Previous settings restored" : "Could not restore settings locally");
    setPreviousSettings(null);
  };

  return (
    <main id="main-content" className="workspace-scroll h-full min-h-0 px-4 py-6 pb-28 md:px-8 md:py-10 md:pb-10">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-[#292d28] pb-7 md:pb-9">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[.55rem] border border-[#3a4038] bg-[#181b18] text-[#d5f06f]">
                <Settings2 className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              </div>
              <p className="workspace-kicker">Studio preferences</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] text-[#f2f0e9] md:text-5xl">Settings</h1>
              <p className="mt-3 max-w-[58ch] text-sm leading-6 text-[#aaa8a1]">
                Set the defaults SoloTensor uses when you start a fresh generation session. Changes stay in this browser.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 border border-[#292d28] bg-[#111311] px-3 py-2 text-xs text-[#aaa8a1]" role="status" aria-live="polite" aria-atomic="true">
              <Check className="h-3.5 w-3.5 text-[#d5f06f]" strokeWidth={2} aria-hidden="true" />
              <span>{status}</span>
            </div>
          </div>
        </header>

        <section className="mt-6 overflow-hidden border border-[#292d28] bg-[#111311] md:mt-8" aria-labelledby="generation-heading">
          <div className="grid gap-4 border-b border-[#292d28] px-5 py-5 md:grid-cols-[auto_1fr] md:gap-5 md:px-7 md:py-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-[.5rem] border border-[#3a4038] bg-[#181b18] text-[#d5f06f]">
              <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div>
              <h2 id="generation-heading" className="text-lg font-semibold tracking-[-.02em] text-[#f2f0e9]">Generation defaults</h2>
              <p className="mt-1 max-w-[60ch] text-sm leading-6 text-[#8a8d85]">These values seed a new generator form. Existing saved inputs remain unchanged.</p>
            </div>
          </div>

          <div className="px-5 py-6 md:px-7 md:py-7">
            <div className="grid gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,.8fr)] lg:gap-10">
              <label className="block" htmlFor="default-format">
                <span className={fieldLabel}>Default format</span>
                <select
                  id="default-format"
                  value={settings.defaultFormat}
                  onChange={(event) => updateSetting("defaultFormat", event.target.value as StudioSettings["defaultFormat"])}
                  aria-describedby="default-format-help"
                  className="workspace-field mt-2 w-full px-3 py-3 text-sm outline-none"
                >
                  {SETTING_FORMATS.map((format) => <option key={format} value={format}>{formatLabels[format]}</option>)}
                </select>
                <span id="default-format-help" className={fieldHelp}>Custom dimensions remain available from the generator.</span>
              </label>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
                <label className="block" htmlFor="default-steps">
                  <span className={fieldLabel}>Default steps</span>
                  <input
                    id="default-steps"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={settings.defaultSteps}
                    onChange={(event) => updateSetting("defaultSteps", Math.min(100, Math.max(1, Number(event.target.value) || 1)))}
                    aria-describedby="default-steps-help"
                    className="workspace-field mt-2 w-full px-3 py-3 text-sm outline-none"
                  />
                  <span id="default-steps-help" className={fieldHelp}>Higher values can add detail and render time.</span>
                </label>

                <label className="block" htmlFor="default-image-count">
                  <span className={fieldLabel}>Images per run</span>
                  <input
                    id="default-image-count"
                    type="number"
                    min={1}
                    max={4}
                    step={1}
                    value={settings.defaultImageCount}
                    onChange={(event) => updateSetting("defaultImageCount", Math.min(4, Math.max(1, Number(event.target.value) || 1)))}
                    aria-describedby="default-image-count-help"
                    className="workspace-field mt-2 w-full px-3 py-3 text-sm outline-none"
                  />
                  <span id="default-image-count-help" className={fieldHelp}>The local workflow supports up to four outputs.</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 flex flex-col gap-4 border border-[#292d28] bg-[#0e100e] px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6" aria-label="Local settings storage">
          <p className="max-w-[52ch] text-xs leading-5 text-[#6f716d]">Settings are stored locally on this device. They are not synced to an account or server.</p>
          <div className="flex shrink-0 items-center gap-2">
            {previousSettings && <button type="button" onClick={undoReset} className="workspace-action-quiet px-2 py-2 text-xs">Undo reset</button>}
            <button
            type="button"
            onClick={handleReset}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[.5rem] border border-[#3a4038] px-3 py-2.5 text-xs font-semibold text-[#aaa8a1] transition hover:border-[#d5f06f] hover:text-[#f2f0e9] active:scale-[.98]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset settings
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { fileToDataUrl } from "@/lib/api";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const MAX_SLOTS = 5;

interface Props {
  references: string[];
  onChange: (refs: string[]) => void;
  disabled?: boolean;
}

export default function ImageUpload({ references, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const room = MAX_SLOTS - references.length;
      if (room <= 0) return;
      const valid = Array.from(files)
        .filter((f) => ACCEPTED.includes(f.type))
        .slice(0, room);
      const dataUrls = await Promise.all(valid.map(fileToDataUrl));
      onChange([...references, ...dataUrls]);
    },
    [references, onChange]
  );

  const removeAt = (index: number) =>
    onChange(references.filter((_, i) => i !== index));

  const slots: (string | null)[] = [
    ...references,
    ...Array(MAX_SLOTS - references.length).fill(null),
  ];

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " "))
            inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled && e.dataTransfer.files.length) {
            void addFiles(e.dataTransfer.files);
          }
        }}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-[.55rem] border border-dashed px-3 py-4 text-xs transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d5f06f] ${
          dragging
            ? "border-[#d5f06f] bg-[#d5f06f]/10 text-[#d5f06f]"
            : "border-[#3a4038] bg-[#111311] text-[#6f716d] hover:border-[#555c50] hover:text-[#aaa8a1]"
        }`}
      >
        <ImagePlus className="h-4 w-4" />
        <span>
          Drop reference images ({references.length}/{MAX_SLOTS})
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {references.length > 0 && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {slots.map((dataUrl, i) =>
            dataUrl ? (
              <div
                key={i}
                className="group relative aspect-square overflow-hidden rounded-[.4rem] border border-[#292d28]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dataUrl}
                  alt={`Reference ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove reference ${i + 1}`}
                  onClick={() => removeAt(i)}
                  className="absolute inset-0 flex items-center justify-center bg-[#0b0c0b]/75 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
            ) : (
              <div
                key={`empty-${i}`}
                className="aspect-square rounded-[.4rem] border border-dashed border-[#292d28] bg-[#111311]/50"
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
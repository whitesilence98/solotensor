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
   <button
    type="button"
    disabled={disabled}
    aria-label="Add reference images"
    aria-describedby="reference-images-help"
    onClick={() => inputRef.current?.click()}
    onDragOver={(e) => {
     e.preventDefault();
     setDragging(true);
    }}
    onDragLeave={() => setDragging(false)}
    onDrop={(e) => {
     e.preventDefault();
     setDragging(false);
     if (!disabled && e.dataTransfer.files.length) {
      void addFiles(e.dataTransfer.files);
     }
    }}
    className={`workspace-command  flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-xs transition-[border-color,background-color,color,transform] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
     dragging
      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
      : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-faint)] hover:border-[var(--accent)] focus-visible:border-[var(--accent)] hover:text-[var(--ink-soft)] focus-visible:text-[var(--ink-soft)]"
    }`}
   >
    <ImagePlus className="h-4 w-4" />
    <span>
     Drop reference images ({references.length}/{MAX_SLOTS})
    </span>
   </button>
   <p id="reference-images-help" className="sr-only">
    Upload up to five PNG, JPEG, or WebP reference images by selecting files or dragging them here.
   </p>

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
        className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--line)]"
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
         className="absolute inset-0 flex items-center justify-center bg-[var(--ground)]/75 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
         <X className="h-4 w-4 text-[var(--ink)]" />
        </button>
       </div>
      ) : (
       <div
        key={`empty-${i}`}
        className="aspect-square rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)]/50"
       />
      )
     )}
    </div>
   )}
  </div>
 );
}
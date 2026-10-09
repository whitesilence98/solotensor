export default function WorkspaceFooter() {
  return (
    <footer className="workspace-footer">
      <span className="flex items-center gap-2 font-semibold text-[var(--ink-soft)]">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent-ambient)]" />
        SoloTensor Studio
      </span>
      <span className="max-w-[58ch] text-right">
        Preferences stay in this browser. Generation runs through your configured local backend.
      </span>
    </footer>
  );
}

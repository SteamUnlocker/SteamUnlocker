import { useRef, useState } from "react";
import { FolderOpen, Upload } from "lucide-react";

export function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      className={`h-full rounded-2xl border border-dashed p-5 flex flex-col items-center justify-center text-center gap-3 transition ${
        over
          ? "border-ctp-mauve bg-ctp-mauve/10"
          : "border-ctp-surface2 bg-ctp-mantle/70 hover:border-ctp-mauve/60"
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-ctp-mauve/15 border border-ctp-mauve/30 flex items-center justify-center">
        <Upload className="w-5 h-5 text-ctp-mauve" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Importer des fichiers</p>
        <p className="text-xs text-ctp-subtext0 mt-0.5">.lua, .st ou .manifest</p>
      </div>
      <button
        onClick={() => input.current?.click()}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1 text-xs font-medium text-white transition"
      >
        <FolderOpen className="w-3.5 h-3.5 text-ctp-mauve" />
        Parcourir
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept=".lua,.st,.manifest"
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

import { useRef, useState } from "react";
import { useCurrentTheme } from "../lib/useTheme";
import { MadotsukiDropSprite, ThemeActionGlyph } from "./ThemeIcons";

export function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const theme = useCurrentTheme();

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
      className={`theme-dropzone relative h-full rounded-2xl border border-dashed p-5 flex flex-col items-center justify-center text-center gap-3 transition overflow-hidden ${
        over
          ? "border-ctp-mauve bg-ctp-mauve/10"
          : "border-ctp-surface2 bg-ctp-mantle/70 hover:border-ctp-mauve/60"
      }`}
    >
      {/* Authentique sprite Madotsuki (Yume Nikki Steam) */}
      {theme === "yume" && (
        <div className="absolute right-3 bottom-2 opacity-95 pointer-events-none">
          <MadotsukiDropSprite />
        </div>
      )}

      {/* Petits artefacts statiques sur Milk */}
      {theme === "milk" && (
        <div className="absolute inset-x-4 top-2.5 flex justify-between text-[9px] font-mono text-ctp-mauve/40 pointer-events-none select-none">
          <span>░░▒</span>
          <span>▓░▒</span>
        </div>
      )}

      <div className="w-10 h-10 rounded-xl bg-ctp-mauve/15 border border-ctp-mauve/30 flex items-center justify-center">
        <ThemeActionGlyph theme={theme} kind="upload" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Importer des fichiers</p>
        <p className="text-xs text-ctp-subtext0 mt-0.5">.lua, .st ou .manifest</p>
      </div>
      <button
        onClick={() => input.current?.click()}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-ctp-surface0 hover:bg-ctp-surface1 text-xs font-medium text-white transition"
      >
        <ThemeActionGlyph theme={theme} kind="folder" />
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

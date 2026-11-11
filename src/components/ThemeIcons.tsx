import {
  FolderOpen,
  Gamepad2,
  HardDrive,
  Home,
  Library,
  Loader2,
  Minus,
  RotateCw,
  Search,
  Settings,
  SlidersHorizontal,
  Square,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { Tab } from "../lib/types";
import type { ThemeId } from "../lib/useTheme";

/** Icônes des onglets issues des sprites et icônes originales des jeux */
export function ThemeNavIcon({ theme, tab }: { theme: ThemeId; tab: Tab }) {
  if (theme === "yume") {
    if (tab === "home") {
      return <img src="/themes/yume/egg_cat.png" alt="" className="w-4 h-4 object-contain pixelated" />;
    }
    if (tab === "search") {
      return <img src="/themes/yume/sprite_eye.png" alt="" className="w-3.5 h-4 object-contain pixelated" />;
    }
    if (tab === "library") {
      return <img src="/themes/yume/egg_knife.png" alt="" className="w-4 h-4 object-contain pixelated" />;
    }
    if (tab === "mode") {
      return <img src="/themes/yume/sprite_stoplight.png" alt="" className="w-4 h-4 object-contain pixelated" />;
    }
    return <img src="/themes/yume/egg_eye.png" alt="" className="w-4 h-4 object-contain pixelated" />;
  }

  if (theme === "milk") {
    if (tab === "home") {
      return <img src="/themes/milk/icon.png" alt="" className="w-3.5 h-3.5 object-contain pixelated" />;
    }
    if (tab === "search") {
      return (
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor" shapeRendering="crispEdges">
          <rect x="4" y="2" width="5" height="1" />
          <rect x="3" y="3" width="1" height="1" />
          <rect x="9" y="3" width="1" height="1" />
          <rect x="2" y="4" width="1" height="4" />
          <rect x="10" y="4" width="1" height="4" />
          <rect x="3" y="8" width="1" height="1" />
          <rect x="9" y="8" width="1" height="1" />
          <rect x="4" y="9" width="5" height="1" />
          <rect x="10" y="9" width="2" height="2" />
          <rect x="12" y="11" width="2" height="2" />
        </svg>
      );
    }
    if (tab === "library") {
      return <img src="/themes/milk/obj_backpack.png" alt="" className="w-3.5 h-4 object-contain pixelated" />;
    }
    if (tab === "mode") {
      return <img src="/themes/milk/obj_laptop.png" alt="" className="w-4 h-3.5 object-contain pixelated" />;
    }
    return <img src="/themes/milk/obj_clock.png" alt="" className="w-3.5 h-4 object-contain pixelated" />;
  }

  if (tab === "home") return <Home className="w-3.5 h-3.5" />;
  if (tab === "search") return <Search className="w-3.5 h-3.5" />;
  if (tab === "library") return <Library className="w-3.5 h-3.5" />;
  if (tab === "mode") return <SlidersHorizontal className="w-3.5 h-3.5" />;
  return <Settings className="w-3.5 h-3.5" />;
}

/** Boutons fenêtre (réduire / agrandir / fermer) stylisés selon la DA de chaque jeu */
export function ThemeWindowControls({
  theme,
  onMinimize,
  onMaximize,
  onClose,
}: {
  theme: ThemeId;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}) {
  if (theme === "yume") {
    // Style fenêtre RPG Maker 2003 (Kikiyama)
    const base =
      "w-7 h-7 flex items-center justify-center bg-[#180a24] border-2 border-[#753e63] shadow-[0_0_0_1px_#08030f,inset_0_0_0_1px_rgba(255,255,255,0.06)] text-[#e2cceb] hover:text-white hover:border-[#b56fa1] transition";
    return (
      <div className="flex items-center gap-1">
        <button onClick={onMinimize} title="Réduire" className={base}>
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor" shapeRendering="crispEdges">
            <rect x="2" y="8" width="8" height="2" />
          </svg>
        </button>
        <button onClick={onMaximize} title="Agrandir" className={base}>
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor" shapeRendering="crispEdges">
            <rect x="2" y="2" width="8" height="2" />
            <rect x="2" y="8" width="8" height="2" />
            <rect x="2" y="4" width="2" height="4" />
            <rect x="8" y="4" width="2" height="4" />
          </svg>
        </button>
        <button
          onClick={onClose}
          title="Fermer"
          className="w-7 h-7 flex items-center justify-center bg-[#4f1627] border-2 border-[#c94758] shadow-[0_0_0_1px_#08030f] text-[#ff91a0] hover:bg-[#e04c5c] hover:text-white transition"
        >
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor" shapeRendering="crispEdges">
            <rect x="2" y="2" width="2" height="2" />
            <rect x="8" y="2" width="2" height="2" />
            <rect x="4" y="4" width="4" height="4" />
            <rect x="2" y="8" width="2" height="2" />
            <rect x="8" y="8" width="2" height="2" />
          </svg>
        </button>
      </div>
    );
  }

  if (theme === "milk") {
    const base =
      "w-7 h-7 flex items-center justify-center border border-[#ef3f5b]/40 bg-[#090107]/90 text-[#e88ea0] hover:text-white hover:border-[#ef3f5b] transition";
    return (
      <div className="flex items-center gap-1">
        <button onClick={onMinimize} title="Réduire" className={base}>
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor" shapeRendering="crispEdges">
            <rect x="2" y="6" width="8" height="1.5" />
          </svg>
        </button>
        <button onClick={onMaximize} title="Agrandir" className={base}>
          <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor" shapeRendering="crispEdges">
            <rect x="2" y="2" width="8" height="1" />
            <rect x="2" y="9" width="8" height="1" />
            <rect x="2" y="3" width="1" height="6" />
            <rect x="9" y="3" width="1" height="6" />
          </svg>
        </button>
        <button
          onClick={onClose}
          title="Fermer"
          className="w-7 h-7 flex items-center justify-center border border-[#ef3f5b]/85 bg-[#2a0613] text-[#ff6981] hover:bg-[#ef3f5b] hover:text-[#090107] transition"
        >
          <svg viewBox="0 0 12 12" className="w-3.5 h-3.5" fill="currentColor" shapeRendering="crispEdges">
            <rect x="2" y="2" width="2" height="2" />
            <rect x="8" y="2" width="2" height="2" />
            <rect x="4" y="4" width="4" height="4" />
            <rect x="2" y="8" width="2" height="2" />
            <rect x="8" y="8" width="2" height="2" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={onMinimize}
        title="Réduire"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-white transition"
      >
        <Minus className="w-4 h-4" />
      </button>
      <button
        onClick={onMaximize}
        title="Agrandir"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-white transition"
      >
        <Square className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onClose}
        title="Fermer"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-ctp-subtext0 hover:bg-ctp-red/20 hover:text-ctp-red transition"
      >
        <X className="w-4 h-4" />
      </button>
    </>
  );
}

/** Icônes utilitaires d'action */
export function ThemeActionGlyph({
  theme,
  kind,
  spinning,
  active,
}: {
  theme: ThemeId;
  kind: "restart" | "music" | "drive" | "folder" | "upload";
  spinning?: boolean;
  active?: boolean;
}) {
  if (kind === "restart") {
    if (spinning) return <Loader2 className="w-4 h-4 text-ctp-mauve animate-spin" />;
    return <RotateCw className="w-4 h-4" />;
  }

  if (kind === "music") {
    if (theme === "milk" || theme === "yume") {
      return (
        <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor" shapeRendering="crispEdges">
          <rect x="2" y="6" width="3" height="4" />
          <rect x="5" y="4" width="2" height="8" />
          <rect x="7" y="2" width="2" height="12" />
          {active ? (
            <>
              <rect x="11" y="5" width="1" height="6" />
              <rect x="13" y="3" width="1" height="10" />
            </>
          ) : (
            <>
              <rect x="11" y="6" width="1" height="1" />
              <rect x="13" y="6" width="1" height="1" />
              <rect x="12" y="7" width="1" height="2" />
              <rect x="11" y="9" width="1" height="1" />
              <rect x="13" y="9" width="1" height="1" />
            </>
          )}
        </svg>
      );
    }
    return active ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />;
  }

  if (kind === "drive") {
    if (theme === "yume") {
      return (
        <img
          src="/themes/yume/face_mado.png"
          alt=""
          className="w-6 h-6 object-contain pixelated"
        />
      );
    }
    if (theme === "milk") {
      return (
        <img
          src="/themes/milk/obj_laptop.png"
          alt=""
          className="w-6 h-5 object-contain pixelated"
        />
      );
    }
    return <HardDrive className={`w-4 h-4 ${active ? "text-ctp-green" : "text-ctp-red"}`} />;
  }

  if (kind === "folder") {
    if (theme === "yume") {
      return <img src="/themes/yume/egg_bike.png" alt="" className="w-4 h-4 object-contain pixelated" />;
    }
    if (theme === "milk") {
      return <img src="/themes/milk/obj_backpack.png" alt="" className="w-3.5 h-4 object-contain pixelated" />;
    }
    return <FolderOpen className="w-3.5 h-3.5 text-ctp-mauve" />;
  }

  if (theme === "yume") {
    return (
      <img
        src="/themes/yume/face_knife.png"
        alt=""
        className="w-7 h-7 object-contain pixelated"
      />
    );
  }
  if (theme === "milk") {
    return (
      <img
        src="/themes/milk/obj_backpack.png"
        alt=""
        className="w-6 h-7 object-contain pixelated"
      />
    );
  }
  return <Upload className="w-5 h-5 text-ctp-mauve" />;
}

/** Jaquette manquante adaptée à l'univers réel du jeu */
export function ThemeMissingCover({ theme }: { theme: ThemeId }) {
  if (theme === "yume") {
    return (
      <div
        className="aspect-[460/215] w-full relative flex items-center justify-center overflow-hidden"
        style={{ background: "radial-gradient(circle at 50% 50%, #241136 0%, #0d051a 100%)" }}
      >
        <img
          src="/themes/yume/face_eye.png"
          alt=""
          className="w-12 h-12 object-contain pixelated drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
        />
      </div>
    );
  }

  if (theme === "milk") {
    return (
      <div className="aspect-[460/215] w-full bg-[#0d0209] relative flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, #2d0719 0px, #2d0719 3px, #090107 3px, #090107 6px)",
          }}
        />
        <img
          src="/themes/milk/obj_laptop.png"
          alt=""
          className="relative w-12 h-9 object-contain pixelated drop-shadow-[0_2px_6px_rgba(239,63,91,0.25)]"
        />
      </div>
    );
  }

  return (
    <div className="aspect-[460/215] w-full bg-ctp-mantle flex items-center justify-center">
      <Gamepad2 className="w-7 h-7 text-ctp-overlay0" />
    </div>
  );
}

/** Authentique sprite de Madotsuki (Kikiyama, Yume Nikki Steam) pour la zone d'import */
export function MadotsukiDropSprite() {
  return (
    <img
      src="/themes/yume/madotsuki.png"
      alt="Madotsuki"
      className="w-10 h-auto object-contain pixelated pointer-events-none select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
    />
  );
}

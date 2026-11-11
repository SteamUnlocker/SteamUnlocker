import { getThemeMeta, type ThemeId } from "../lib/useTheme";

export function ThemeBackdrop({ theme }: { theme: ThemeId }) {
  const meta = getThemeMeta(theme);
  if (!meta.wallpaper) return null;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none select-none overflow-hidden">
      {/* Artwork / fond original de l'univers */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${meta.wallpaper})` }}
      />

      {/* Voile d'équilibrage pour garantir une lisibilité nette sans cacher l'artwork */}
      <div
        className="absolute inset-0"
        style={{
          background:
            theme === "yume"
              ? "linear-gradient(180deg, rgba(16,8,30,0.56) 0%, rgba(16,8,30,0.24) 55%, rgba(12,6,24,0.42) 100%)"
              : "linear-gradient(180deg, rgba(9,1,7,0.6) 0%, rgba(9,1,7,0.3) 55%, rgba(9,1,7,0.24) 100%)",
        }}
      />

      {/* Tramage CRT subtil (Milk) */}
      {theme === "milk" && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(rgba(239, 63, 91, 0.12) 1px, transparent 0), repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0, 0, 0, 0.25) 4px)",
            backgroundSize: "4px 4px, 100% 4px",
          }}
        />
      )}
    </div>
  );
}

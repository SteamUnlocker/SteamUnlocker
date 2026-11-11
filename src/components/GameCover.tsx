import { useState } from "react";
import { coverUrl } from "../lib/api";
import { useCurrentTheme } from "../lib/useTheme";
import { ThemeMissingCover } from "./ThemeIcons";

export function GameCover({ appId, name }: { appId: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const theme = useCurrentTheme();

  if (failed || !/^\d+$/.test(appId)) {
    return <ThemeMissingCover theme={theme} />;
  }

  return (
    <img
      src={coverUrl(appId)}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-[460/215] w-full object-cover bg-ctp-mantle"
    />
  );
}

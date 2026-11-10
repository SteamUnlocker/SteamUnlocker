import { useState } from "react";
import { Gamepad2 } from "lucide-react";
import { coverUrl } from "../lib/api";

export function GameCover({ appId, name }: { appId: string; name: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || !/^\d+$/.test(appId)) {
    return (
      <div className="aspect-[460/215] w-full bg-ctp-mantle flex items-center justify-center">
        <Gamepad2 className="w-7 h-7 text-ctp-overlay0" />
      </div>
    );
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

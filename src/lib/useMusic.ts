import { useEffect, useRef, useState } from "react";

/** Musique de fond : toujours coupée au lancement, volume mémorisé. */
export function useMusic() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(
    () => Number(localStorage.getItem("volume") ?? "0.5")
  );

  useEffect(() => {
    const a = new Audio("/bgm.mp3");
    a.loop = true;
    a.volume = volume;
    audio.current = a;
    return () => a.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async () => {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      try {
        await a.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  };

  const setVolume = (v: number) => {
    setVolumeState(v);
    localStorage.setItem("volume", String(v));
    if (audio.current) audio.current.volume = v;
  };

  return { playing, toggle, volume, setVolume };
}

export type Music = ReturnType<typeof useMusic>;

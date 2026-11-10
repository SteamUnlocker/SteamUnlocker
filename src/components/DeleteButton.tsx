import { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";

/** Bouton de suppression en deux clics : conserve une largeur fixe si utilisé sans label. */
export function DeleteButton({ onConfirm, label }: { onConfirm: () => void; label?: string }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      title={armed ? "Cliquer à nouveau pour supprimer" : "Supprimer"}
      className={`h-8 flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition ${
        label ? "px-3" : "w-8"
      } ${
        armed
          ? "bg-ctp-red text-ctp-crust"
          : "bg-ctp-mantle text-ctp-red hover:bg-ctp-red/15"
      }`}
    >
      {armed ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
      {label ? (armed ? "Confirmer" : label) : null}
    </button>
  );
}

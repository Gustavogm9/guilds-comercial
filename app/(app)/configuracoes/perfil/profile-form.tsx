"use client";

import { useTransition, useState } from "react";
import { updateProfile } from "./actions";
import { Loader2, Check } from "lucide-react";
import { formatTelefoneBR, FUSOS_BRASIL } from "@/lib/utils/br-fiscal";

export default function ProfileForm({
  initialName,
  initialTelefone,
  initialTimezone,
}: {
  initialName: string;
  initialTelefone?: string | null;
  initialTimezone?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [telefone, setTelefone] = useState(initialTelefone ? formatTelefoneBR(initialTelefone) : "");
  const [salvouRecente, setSalvouRecente] = useState(false);

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const res = await updateProfile(formData);
      if (res.error) {
        alert(res.error);
      } else {
        setSalvouRecente(true);
        setTimeout(() => setSalvouRecente(false), 2500);
      }
    });
  };

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="display_name" className="block text-sm font-medium text-foreground mb-1">
          Nome Completo
        </label>
        <input
          type="text"
          id="display_name"
          name="display_name"
          defaultValue={initialName}
          required
          className="input-base w-full"
          placeholder="Seu nome"
        />
      </div>

      <div>
        <label htmlFor="telefone" className="block text-sm font-medium text-foreground mb-1">
          Telefone <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <input
          type="tel"
          id="telefone"
          name="telefone"
          value={telefone}
          onChange={(e) => setTelefone(formatTelefoneBR(e.target.value))}
          className="input-base w-full"
          placeholder="(11) 98765-4321"
          maxLength={16}
        />
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium text-foreground mb-1">
          Fuso horário
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={initialTimezone ?? "America/Sao_Paulo"}
          className="input-base w-full"
        >
          {FUSOS_BRASIL.map((tz) => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-end items-center gap-3 pt-2">
        {salvouRecente && (
          <span className="text-sm text-success-500 flex items-center gap-1">
            <Check className="w-4 h-4" /> Salvo
          </span>
        )}
        <button type="submit" disabled={isPending} className="btn-primary min-w-[120px]">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Salvar Alterações"}
        </button>
      </div>
    </form>
  );
}

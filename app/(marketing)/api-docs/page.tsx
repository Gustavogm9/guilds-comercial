"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";
import { useEffect, useState } from "react";

// Como swagger-ui-react depende do objeto 'window', precisamos carregá-lo dinamicamente
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function ApiDocsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="p-12 text-center text-muted-foreground">Carregando documentação...</div>;

  return (
    <div className="bg-card min-h-screen pt-24 pb-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 border-b border-border pb-8 text-center">
          <h1 className="text-3xl font-light text-foreground tracking-tight">Referência da API</h1>
          <p className="mt-4 text-lg text-muted-foreground font-light">
            Documentação interativa da API REST do Guilds Comercial. Utilize sua API Key para testar os endpoints diretamente por aqui.
          </p>
        </div>

        {/* Renderiza a UI do Swagger */}
        <div className="swagger-container border border-border rounded-2xl shadow-stripe-sm overflow-hidden bg-secondary/40 dark:bg-white/[0.02] p-4">
          <SwaggerUI url="/openapi.json" />
        </div>
      </div>
    </div>
  );
}

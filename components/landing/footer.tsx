import Link from "next/link";
import { Github, Twitter, Linkedin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-secondary/40 dark:bg-white/[0.02] border-t border-border pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 group mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold text-sm">
                G
              </div>
              <span className="font-semibold text-lg text-foreground tracking-tight">Guilds Comercial</span>
            </Link>
            <p className="text-muted-foreground text-sm max-w-sm">
              O CRM turbinado com Inteligência Artificial. Escale suas vendas B2B com cadências automáticas e previsibilidade baseada em dados.
            </p>
            <div className="flex gap-4 mt-6">
              <a href="#" className="text-muted-foreground/70 hover:text-primary transition-colors">
                <span className="sr-only">Twitter</span>
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-muted-foreground/70 hover:text-primary transition-colors">
                <span className="sr-only">LinkedIn</span>
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="#" className="text-muted-foreground/70 hover:text-primary transition-colors">
                <span className="sr-only">GitHub</span>
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Produto</h3>
            <ul className="space-y-3">
              <li><Link href="#features" className="text-sm text-muted-foreground hover:text-primary">Funcionalidades</Link></li>
              <li><Link href="#precos" className="text-sm text-muted-foreground hover:text-primary">Preços</Link></li>
              <li><Link href="/cadastro" className="text-sm text-muted-foreground hover:text-primary">Criar conta grátis</Link></li>
              <li><Link href="/api-docs" className="text-sm text-muted-foreground hover:text-primary">API para Desenvolvedores</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Empresa</h3>
            <ul className="space-y-3">
              <li><Link href="/ajuda" className="text-sm text-muted-foreground hover:text-primary">Central de Ajuda</Link></li>
              <li><a href="mailto:suporte@guilds.com.br" className="text-sm text-muted-foreground hover:text-primary">Contato</a></li>
              <li><Link href="/termos" className="text-sm text-muted-foreground hover:text-primary">Termos de Uso</Link></li>
              <li><Link href="/privacidade" className="text-sm text-muted-foreground hover:text-primary">Política de Privacidade</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground tabular-nums">
            &copy; {new Date().getFullYear()} Guilds Comercial. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}

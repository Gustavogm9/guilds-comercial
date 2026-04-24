import Link from "next/link";
import { Github, Twitter, Linkedin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 group mb-4">
              <div className="w-8 h-8 rounded-lg bg-guild-600 grid place-items-center text-white font-bold text-sm">
                G
              </div>
              <span className="font-semibold text-lg text-slate-800 tracking-tight">Guilds Comercial</span>
            </Link>
            <p className="text-slate-500 text-sm max-w-sm">
              O CRM turbinado com Inteligência Artificial. Escale suas vendas B2B com cadências automáticas e previsibilidade baseada em dados.
            </p>
            <div className="flex gap-4 mt-6">
              <a href="#" className="text-slate-400 hover:text-guild-600 transition-colors">
                <span className="sr-only">Twitter</span>
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-slate-400 hover:text-guild-600 transition-colors">
                <span className="sr-only">LinkedIn</span>
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="#" className="text-slate-400 hover:text-guild-600 transition-colors">
                <span className="sr-only">GitHub</span>
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>
          
          <div>
            <h3 className="font-semibold text-slate-900 mb-4">Produto</h3>
            <ul className="space-y-3">
              <li><Link href="#features" className="text-sm text-slate-500 hover:text-guild-600">Funcionalidades</Link></li>
              <li><Link href="#precos" className="text-sm text-slate-500 hover:text-guild-600">Preços</Link></li>
              <li><Link href="/cadastro" className="text-sm text-slate-500 hover:text-guild-600">Criar conta grátis</Link></li>
              <li><Link href="/api-docs" className="text-sm text-slate-500 hover:text-guild-600">API para Desenvolvedores</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-4">Empresa</h3>
            <ul className="space-y-3">
              <li><Link href="/ajuda" className="text-sm text-slate-500 hover:text-guild-600">Central de Ajuda</Link></li>
              <li><a href="mailto:suporte@guilds.com.br" className="text-sm text-slate-500 hover:text-guild-600">Contato</a></li>
              <li><Link href="/termos" className="text-sm text-slate-500 hover:text-guild-600">Termos de Uso</Link></li>
              <li><Link href="/privacidade" className="text-sm text-slate-500 hover:text-guild-600">Política de Privacidade</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} Guilds Comercial. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}

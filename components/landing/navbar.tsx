"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Navbar({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white/70 backdrop-blur-md border-b border-slate-200/50 shadow-sm py-3" : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-guild-600 grid place-items-center text-white font-bold text-sm group-hover:scale-105 transition-transform">
            G
          </div>
          <span className="font-semibold text-lg text-slate-800 tracking-tight">Guilds Comercial</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <Link href="#features" className="hover:text-guild-600 transition-colors">Recursos</Link>
          <Link href="#como-funciona" className="hover:text-guild-600 transition-colors">Como Funciona</Link>
          <Link href="#precos" className="hover:text-guild-600 transition-colors">Preços</Link>
        </nav>

        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <Link href="/hoje" className="btn-primary">
              Ir para o Painel
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden sm:inline-block text-sm font-medium text-slate-600 hover:text-guild-600 transition-colors">
                Entrar
              </Link>
              <Link href="/cadastro" className="btn-primary">
                Criar conta grátis
              </Link>
            </>
          )}
        </div>
      </div>
    </motion.header>
  );
}

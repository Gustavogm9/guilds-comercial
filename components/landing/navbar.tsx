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
        scrolled ? "bg-background/80 backdrop-blur border-b border-border shadow-stripe-xs py-3" : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold text-sm group-hover:scale-105 transition-transform">
            G
          </div>
          <span className="font-semibold text-lg text-foreground tracking-tight">Guilds Comercial</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <Link href="#features" className="hover:text-primary transition-colors">Recursos</Link>
          <Link href="#como-funciona" className="hover:text-primary transition-colors">Como Funciona</Link>
          <Link href="#precos" className="hover:text-primary transition-colors">Preços</Link>
        </nav>

        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <Link href="/hoje" className="btn-primary">
              Ir para o Painel
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden sm:inline-block text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
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

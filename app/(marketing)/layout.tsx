import Navbar from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";

/**
 * Layout das páginas de marketing (/, /ajuda, /termos, /privacidade, /dpa, /api-docs).
 *
 * RSC síncrono e sem queries — permite que as páginas filhas rodem como SSG/static
 * e sejam cacheadas no edge. A detecção de "logado" foi movida pro Navbar
 * (client component) que usa supabase auth no browser via onAuthStateChange.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col font-sans bg-background selection:bg-primary/20 selection:text-primary">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}

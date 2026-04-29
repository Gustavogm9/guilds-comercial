import { createClient } from "@/lib/supabase/server";
import Navbar from "@/components/landing/navbar";
import Footer from "@/components/landing/footer";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const isLoggedIn = !!session;

  return (
    <div className="min-h-screen flex flex-col font-sans bg-background selection:bg-primary/20 selection:text-primary">
      <Navbar isLoggedIn={isLoggedIn} />
      
      <main className="flex-1">
        {children}
      </main>

      <Footer />
    </div>
  );
}

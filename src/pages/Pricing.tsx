import { Link } from "react-router-dom";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlansSection } from "@/components/PlansSection";

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="container flex items-center justify-between py-5">
        <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Volver al inicio
        </Link>
        <Link to="/auth">
          <Button variant="outline" size="sm">Iniciar sesión</Button>
        </Link>
      </header>

      <PlansSection />

      <footer className="border-t py-8 text-center text-sm text-muted-foreground bg-card/60 backdrop-blur-sm mt-10">
        <div className="flex items-center justify-center gap-2">
          <BadgeCheck className="h-4 w-4 text-primary" />
          GEXSATELIT · Pago seguro vía Stripe · Solo con fines educativos
        </div>
      </footer>
    </div>
  );
}

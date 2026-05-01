import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import LoyaltyProgramDetails from "./pages/LoyaltyProgramDetails";
import Auth from "./pages/Auth";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import Me from "./pages/Me";
import ClientProfile from "./pages/ClientProfile";
import SearchFlightsScreen from "./pages/SearchFlightsScreen";
import FlightResultsScreen from "./pages/FlightResultsScreen";
import EmissionDetailsScreen from "./pages/EmissionDetailsScreen";
import PurchaseOptionsScreen from "./pages/PurchaseOptionsScreen";
import PriceCalendarScreen from "./pages/PriceCalendarScreen";
import BonusOffersScreen from "./pages/BonusOffersScreen";
import BonusOfferDetailScreen from "./pages/BonusOfferDetailScreen";
import VencimentosPage from "./pages/VencimentosPage";
import RegistrarEmissaoPage from "./pages/RegistrarEmissaoPage";
import CriarAlertaPage from "./pages/CriarAlertaPage";
import SobreGestMilesPage from "./pages/SobreGestMilesPage";
import ConvideAmigosPage from "./pages/ConvideAmigosPage";
import DuvidasPage from "./pages/DuvidasPage";
import FaleConoscoPage from "./pages/FaleConoscoPage";
import PreferenciasSugestoesPage from "./pages/PreferenciasSugestoesPage";
import SimularCompraMilhasPage from "./pages/SimularCompraMilhasPage";
import RadarOportunidadesPage from "./pages/RadarOportunidadesPage";
import ClienteInsightsPage from "./pages/ClienteInsightsPage";
import ClienteTimelinePage from "./pages/ClienteTimelinePage";
import AssinaturaClientePage from "./pages/AssinaturaClientePage";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SearchFlightsProvider } from "@/contexts/SearchFlightsContext";
import RequireAuth from "@/components/RequireAuth";
import HomeGate from "@/components/HomeGate";
import RequireClienteApp from "@/components/RequireClienteApp";
import MissingSupabaseConfig from "@/components/MissingSupabaseConfig";
import { isSupabaseConfigured } from "@/lib/supabase";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const APP_BOOT_READY_EVENT = "gest-miles:usuario-boot-ready";

function AppBootReadySignal() {
  const { loading, roleLoading } = useAuth();

  useEffect(() => {
    if (!loading && !roleLoading) {
      window.dispatchEvent(new Event(APP_BOOT_READY_EVENT));
    }
  }, [loading, roleLoading]);

  return null;
}

/** Rotas exclusivas de cliente / cliente gestão (equipa interna usa Manager ou Admin). */
function ClienteOnly({ children }: { children: JSX.Element }) {
  return (
    <RequireAuth>
      <RequireClienteApp>{children}</RequireClienteApp>
    </RequireAuth>
  );
}

const App = () => {
  if (!isSupabaseConfigured) {
    return <MissingSupabaseConfig />;
  }

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <AppBootReadySignal />
        <SearchFlightsProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomeGate />} />
              <Route
                path="/assinatura"
                element={
                  <ClienteOnly>
                    <AssinaturaClientePage />
                  </ClienteOnly>
                }
              />
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/sign-up" element={<SignUp />} />
              <Route path="/auth/forgot-password" element={<ForgotPassword />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="/auth/accept-invite" element={<AcceptInvite />} />
              <Route path="/me" element={<Me />} />
              <Route
                path="/search-flights"
                element={
                  <ClienteOnly>
                    <SearchFlightsScreen />
                  </ClienteOnly>
                }
              />
              <Route
                path="/flight-results"
                element={
                  <ClienteOnly>
                    <FlightResultsScreen />
                  </ClienteOnly>
                }
              />
              <Route
                path="/emission-details"
                element={
                  <ClienteOnly>
                    <EmissionDetailsScreen />
                  </ClienteOnly>
                }
              />
              <Route
                path="/purchase-options"
                element={
                  <ClienteOnly>
                    <PurchaseOptionsScreen />
                  </ClienteOnly>
                }
              />
              <Route path="/passagens" element={<Navigate to="/search-flights" replace />} />
              <Route path="/alertas" element={<Navigate to="/vencimentos" replace />} />
              <Route path="/programas" element={<Navigate to="/?view=programas" replace />} />
              <Route
                path="/price-calendar"
                element={
                  <ClienteOnly>
                    <PriceCalendarScreen />
                  </ClienteOnly>
                }
              />
              <Route
                path="/bonus-offers"
                element={
                  <ClienteOnly>
                    <BonusOffersScreen />
                  </ClienteOnly>
                }
              />
              <Route
                path="/bonus-offers/:id"
                element={
                  <ClienteOnly>
                    <BonusOfferDetailScreen />
                  </ClienteOnly>
                }
              />
              <Route
                path="/registrar-emissao"
                element={
                  <ClienteOnly>
                    <RegistrarEmissaoPage />
                  </ClienteOnly>
                }
              />
              <Route
                path="/alertas/novo"
                element={
                  <ClienteOnly>
                    <CriarAlertaPage />
                  </ClienteOnly>
                }
              />
              <Route
                path="/perfil"
                element={
                  <ClienteOnly>
                    <ClientProfile />
                  </ClienteOnly>
                }
              />
              <Route
                path="/preferencias-sugestoes"
                element={
                  <ClienteOnly>
                    <PreferenciasSugestoesPage />
                  </ClienteOnly>
                }
              />
              <Route
                path="/simular-compra-milhas"
                element={
                  <ClienteOnly>
                    <SimularCompraMilhasPage />
                  </ClienteOnly>
                }
              />
              <Route
                path="/radar-oportunidades"
                element={
                  <ClienteOnly>
                    <RadarOportunidadesPage />
                  </ClienteOnly>
                }
              />
              <Route
                path="/vencimentos"
                element={
                  <ClienteOnly>
                    <VencimentosPage />
                  </ClienteOnly>
                }
              />
              <Route
                path="/program/:programId"
                element={
                  <ClienteOnly>
                    <LoyaltyProgramDetails />
                  </ClienteOnly>
                }
              />
              <Route
                path="/sobre"
                element={
                  <ClienteOnly>
                    <SobreGestMilesPage />
                  </ClienteOnly>
                }
              />
              <Route
                path="/convide-amigos"
                element={
                  <ClienteOnly>
                    <ConvideAmigosPage />
                  </ClienteOnly>
                }
              />
              <Route
                path="/duvidas"
                element={
                  <ClienteOnly>
                    <DuvidasPage />
                  </ClienteOnly>
                }
              />
              <Route
                path="/fale-conosco"
                element={
                  <ClienteOnly>
                    <FaleConoscoPage />
                  </ClienteOnly>
                }
              />
              <Route path="/cliente/:id/insights" element={<ClienteInsightsPage />} />
              <Route path="/cliente/:id/timeline" element={<ClienteTimelinePage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SearchFlightsProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;

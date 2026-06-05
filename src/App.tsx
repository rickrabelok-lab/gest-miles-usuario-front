import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SearchFlightsProvider } from "@/contexts/SearchFlightsContext";
import RequireAuth from "@/components/RequireAuth";
import HomeGate from "@/components/HomeGate";
import RequireClienteApp from "@/components/RequireClienteApp";
import MissingSupabaseConfig from "@/components/MissingSupabaseConfig";
import { isSupabaseConfigured } from "@/lib/supabase";
import CookieNotice from "@/components/CookieNotice";

const NotFound = lazy(() => import("./pages/NotFound"));
const LoyaltyProgramDetails = lazy(() => import("./pages/LoyaltyProgramDetails"));
const Auth = lazy(() => import("./pages/Auth"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Me = lazy(() => import("./pages/Me"));
const ClientProfile = lazy(() => import("./pages/ClientProfile"));
const SearchFlightsScreen = lazy(() => import("./pages/SearchFlightsScreen"));
const FlightResultsScreen = lazy(() => import("./pages/FlightResultsScreen"));
const EmissionDetailsScreen = lazy(() => import("./pages/EmissionDetailsScreen"));
const PurchaseOptionsScreen = lazy(() => import("./pages/PurchaseOptionsScreen"));
const PriceCalendarScreen = lazy(() => import("./pages/PriceCalendarScreen"));
const BonusOffersScreen = lazy(() => import("./pages/BonusOffersScreen"));
const BonusOfferDetailScreen = lazy(() => import("./pages/BonusOfferDetailScreen"));
const VencimentosPage = lazy(() => import("./pages/VencimentosPage"));
const RegistrarEmissaoPage = lazy(() => import("./pages/RegistrarEmissaoPage"));
const CriarAlertaPage = lazy(() => import("./pages/CriarAlertaPage"));
const SobreGestMilesPage = lazy(() => import("./pages/SobreGestMilesPage"));
const ConvideAmigosPage = lazy(() => import("./pages/ConvideAmigosPage"));
const DuvidasPage = lazy(() => import("./pages/DuvidasPage"));
const FaleConoscoPage = lazy(() => import("./pages/FaleConoscoPage"));
const PreferenciasSugestoesPage = lazy(() => import("./pages/PreferenciasSugestoesPage"));
const SimularCompraMilhasPage = lazy(() => import("./pages/SimularCompraMilhasPage"));
const RadarOportunidadesPage = lazy(() => import("./pages/RadarOportunidadesPage"));
const ClienteInsightsPage = lazy(() => import("./pages/ClienteInsightsPage"));
const ClienteTimelinePage = lazy(() => import("./pages/ClienteTimelinePage"));
const AssinaturaClientePage = lazy(() => import("./pages/AssinaturaClientePage"));

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

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-muted-foreground">Carregando tela...</p>
      </div>
    </div>
  );
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
      <CookieNotice />
      <AuthProvider>
        <AppBootReadySignal />
        <SearchFlightsProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteLoading />}>
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
                <Route
                  path="/cliente/:id"
                  element={
                    <ClienteOnly>
                      <Navigate to="timeline" replace />
                    </ClienteOnly>
                  }
                />
                <Route path="/cliente/:id/insights" element={<ClienteInsightsPage />} />
                <Route path="/cliente/:id/timeline" element={<ClienteTimelinePage />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </SearchFlightsProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;

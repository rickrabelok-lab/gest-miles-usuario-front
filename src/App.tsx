import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LoyaltyProgramDetails from "./pages/LoyaltyProgramDetails";
import Auth from "./pages/Auth";
import Me from "./pages/Me";
import GestorDashboard from "./pages/GestorDashboard";
import ClientProfile from "./pages/ClientProfile";
import SearchFlightsScreen from "./pages/SearchFlightsScreen";
import PriceCalendarScreen from "./pages/PriceCalendarScreen";
import BonusOffersScreen from "./pages/BonusOffersScreen";
import ClientePage from "./pages/ClientePage";
import VencimentosPage from "./pages/VencimentosPage";
import RegistrarEmissaoPage from "./pages/RegistrarEmissaoPage";
import CriarAlertaPage from "./pages/CriarAlertaPage";
import SobreGestMilesPage from "./pages/SobreGestMilesPage";
import ConvideAmigosPage from "./pages/ConvideAmigosPage";
import DuvidasPage from "./pages/DuvidasPage";
import FaleConoscoPage from "./pages/FaleConoscoPage";
import CsDashboardPage from "./pages/CsDashboardPage";
import PreferenciasSugestoesPage from "./pages/PreferenciasSugestoesPage";
import SimularCompraMilhasPage from "./pages/SimularCompraMilhasPage";
import RadarOportunidadesPage from "./pages/RadarOportunidadesPage";
import { AuthProvider } from "@/contexts/AuthContext";
import { SearchFlightsProvider } from "@/contexts/SearchFlightsContext";
import ProtectedByRole from "@/components/RequireRole";
import RequireAuth from "@/components/RequireAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <SearchFlightsProvider>
          <BrowserRouter>
            <Routes>
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <Index />
                  </RequireAuth>
                }
              />
              <Route path="/auth" element={<Auth />} />
              <Route path="/me" element={<Me />} />
              <Route path="/search-flights" element={<SearchFlightsScreen />} />
              <Route path="/price-calendar" element={<PriceCalendarScreen />} />
              <Route path="/bonus-offers" element={<BonusOffersScreen />} />
              <Route
                path="/registrar-emissao"
                element={
                  <RequireAuth>
                    <RegistrarEmissaoPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/alertas/novo"
                element={
                  <RequireAuth>
                    <CriarAlertaPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/perfil"
                element={
                  <RequireAuth>
                    <ClientProfile />
                  </RequireAuth>
                }
              />
              <Route
                path="/gestor"
                element={
                  <ProtectedByRole allow={["gestor", "admin"]}>
                    <GestorDashboard />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/cliente"
                element={
                  <ProtectedByRole allow={["gestor", "admin"]}>
                    <ClientePage />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/clientes"
                element={
                  <ProtectedByRole allow={["gestor", "admin"]}>
                    <ClientePage />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/cs"
                element={
                  <ProtectedByRole allow={["cs", "admin"]}>
                    <CsDashboardPage />
                  </ProtectedByRole>
                }
              />
              <Route
                path="/preferencias-sugestoes"
                element={
                  <RequireAuth>
                    <PreferenciasSugestoesPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/simular-compra-milhas"
                element={
                  <RequireAuth>
                    <SimularCompraMilhasPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/radar-oportunidades"
                element={
                  <RequireAuth>
                    <RadarOportunidadesPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/vencimentos"
                element={
                  <RequireAuth>
                    <VencimentosPage />
                  </RequireAuth>
                }
              />
              <Route path="/program/:programId" element={<LoyaltyProgramDetails />} />
              <Route
                path="/sobre"
                element={
                  <RequireAuth>
                    <SobreGestMilesPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/convide-amigos"
                element={
                  <RequireAuth>
                    <ConvideAmigosPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/duvidas"
                element={
                  <RequireAuth>
                    <DuvidasPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/fale-conosco"
                element={
                  <RequireAuth>
                    <FaleConoscoPage />
                  </RequireAuth>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SearchFlightsProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

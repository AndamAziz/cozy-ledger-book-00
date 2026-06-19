import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { BotNotificationsProvider } from "@/contexts/BotNotificationsContext";
import Index from "./pages/Index";
import CryptoTracker from "./pages/CryptoTracker";
import Movies from "./pages/Movies";
import GestureQA from "./pages/GestureQA";
import Bots from "./pages/Bots";
import BotDetail from "./pages/BotDetail";
import Reviews from "./pages/Reviews";
import ResetPassword from "./pages/ResetPassword";
import EmailStatus from "./pages/EmailStatus";
import NotFound from "./pages/NotFound";


const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <BotNotificationsProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/crypto" element={<CryptoTracker />} />
                <Route path="/movies" element={<Movies />} />
                <Route path="/gesture-qa" element={<GestureQA />} />
                <Route path="/bots" element={<Bots />} />
                <Route path="/bots/:id" element={<BotDetail />} />
                <Route path="/reviews" element={<Reviews />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/email-status" element={<EmailStatus />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BotNotificationsProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </LanguageProvider>
  </HelmetProvider>
);

export default App;

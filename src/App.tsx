/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { 
  onAuthStateChanged, 
  signInWithPopup,
  signInWithRedirect, 
  getRedirectResult, 
  setPersistence,
  browserLocalPersistence,
  signOut, 
  User 
} from "firebase/auth";
import { 
  ref, 
  onValue 
} from "firebase/database";
import { 
  LayoutDashboard, 
  LogOut, 
  Filter, 
  RefreshCcw, 
  Search, 
  Info,
  TrendingUp,
  Link as LinkIcon,
  Users,
  Box,
  ChartBar,
  ShoppingBag,
  CreditCard,
  Smartphone,
  Calendar
} from "lucide-react";
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend, 
  ArcElement,
  PointElement,
  LineElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { motion, AnimatePresence } from "motion/react";

import { auth, googleProvider, database } from "./lib/firebase";
import { PurchaseRecord, FilterOptions, KPIStats } from "./types";

// Register ChartJS
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

// Global Chart.js Defaults for Dark Mode
ChartJS.defaults.color = '#94A3B8';
ChartJS.defaults.borderColor = 'rgba(148, 163, 184, 0.08)';
ChartJS.defaults.font.family = "'Inter', sans-serif";
ChartJS.defaults.plugins.tooltip.backgroundColor = '#111827';
ChartJS.defaults.plugins.tooltip.borderColor = '#243044';
ChartJS.defaults.plugins.tooltip.borderWidth = 1;
ChartJS.defaults.plugins.tooltip.titleColor = '#F3F4F6';
ChartJS.defaults.plugins.tooltip.bodyColor = '#D1D5DB';
ChartJS.defaults.plugins.tooltip.padding = 12;
ChartJS.defaults.plugins.tooltip.cornerRadius = 10;
ChartJS.defaults.plugins.legend.labels.padding = 24;
ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
ChartJS.defaults.plugins.legend.labels.boxWidth = 10;
ChartJS.defaults.plugins.legend.labels.boxHeight = 10;
ChartJS.defaults.plugins.legend.labels.font = {
  size: 11,
  weight: 500
};

// Helper constants
const INITIAL_FILTERS: FilterOptions = {
  korcsoport: "",
  nem: "",
  webáruház: "",
  vásároltÁru: "",
  rendelésiEszköz: "",
  fizetésiMód: "",
  searchTerm: ""
};

// Formatting helper
const formatDisplay = (val: string) => val === "Mobile" ? "Mobil" : val;

function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

// Normalization Helper
function normalizeStoreName(value: string): string {
  const cleaned = String(value || "").trim().toLowerCase();
  if (cleaned === "amazon") return "Amazon";
  if (cleaned === "flipkart") return "Flipkart";
  if (cleaned === "myntra") return "Myntra";
  return value;
}

// Return Rate Helpers
function parseReturnRate(value: unknown): number {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const normalized = value.replace("%", "").replace(",", ".").trim();
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function averageReturnRate(records: PurchaseRecord[]): number {
  if (!records || records.length === 0) return 0;

  const validRates = records
    .map(record => parseReturnRate(record.visszakuldesi_arany_szazalek))
    .filter(value => !Number.isNaN(value));

  if (validRates.length === 0) return 0;

  const sum = validRates.reduce((acc, value) => acc + value, 0);
  return sum / validRates.length;
}

export default function App() {
  const [user, setUser] = useState<User | any>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PurchaseRecord[]>([]);
  const [filters, setFilters] = useState<FilterOptions>(INITIAL_FILTERS);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Return Rate Analysis state
  const [returnRateDimension, setReturnRateDimension] = useState("Nem × Életkor");

  // Auth Initialization & Listener
  useEffect(() => {
    const initAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        const result = await getRedirectResult(auth);
        if (result?.user) {
          setUser(result.user);
          setError(null);
        }
      } catch (err: any) {
        console.error("Auth Init Error:", err);
        setError(`Bejelentkezési hiba (${err.code}): ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setIsDemoMode(false);
      } else {
        if (!isDemoMode) setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    if (!user && !isDemoMode) return;

    setLoading(true);
    const dataRef = ref(database, "online_vasarloi_magatartas");
    
    const unsubscribe = onValue(dataRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        const records = Object.entries(val).map(([id, item]) => ({
          id,
          ...(item as any)
        })) as PurchaseRecord[];
        setData(records);
      } else {
        setData([]);
      }
      setLoading(false);
    }, (err) => {
      console.error("Firebase Database Error:", err);
      setError("Hiba történt az adatok betöltésekor. Kérjük, ellenőrizd a jogosultságokat.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, isDemoMode]);

  // Filtering Logic
  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesKor = !filters.korcsoport || item.korcsoport === filters.korcsoport;
      const matchesNem = !filters.nem || item.nem === filters.nem;
      const matchesWeb = !filters.webáruház || normalizeStoreName(item.preferalt_webaruhaz) === filters.webáruház;
      const matchesAru = !filters.vásároltÁru || item.vasarolt_aru === filters.vásároltÁru;
      const matchesEszkoz = !filters.rendelésiEszköz || item.hasznalt_eszkoz === filters.rendelésiEszköz;
      const matchesFizetes = !filters.fizetésiMód || item.fizetesi_mod === filters.fizetésiMód;
      
      const searchStr = filters.searchTerm.toLowerCase();
      const matchesSearch = !searchStr || 
        item.felhasznalo_azonosito.toLowerCase().includes(searchStr) ||
        item.preferalt_webaruhaz.toLowerCase().includes(searchStr) ||
        item.vasarolt_aru.toLowerCase().includes(searchStr);

      return matchesKor && matchesNem && matchesWeb && matchesAru && matchesEszkoz && matchesFizetes && matchesSearch;
    });
  }, [data, filters]);

  // Helper Analysis Functions
  const getMostFrequent = (arr: any[]) => {
    if (arr.length === 0) return "-";
    const counts: Record<string, number> = {};
    arr.forEach(val => counts[val] = (counts[val] || 0) + 1);
    return Object.entries(counts).reduce((a, b) => b[1] > a[1] ? b : a)[0];
  };

  // KPI Calculations
  const stats: KPIStats = useMemo(() => {
    return {
      popularStore: getMostFrequent(filteredData.map(d => normalizeStoreName(d.preferalt_webaruhaz))),
      dominantCategory: getMostFrequent(filteredData.map(d => d.vasarolt_aru)),
      commonPayment: getMostFrequent(filteredData.map(d => d.fizetesi_mod)),
      averageReturnRate: averageReturnRate(filteredData),
      commonDevice: formatDisplay(getMostFrequent(filteredData.map(d => d.hasznalt_eszkoz))),
      dominantFrequency: getMostFrequent(filteredData.map(d => d.vasarlasi_gyakorisag))
    };
  }, [filteredData]);

  // Unique options for filters
  const filterOptions = useMemo(() => {
    return {
      életkor: Array.from(new Set(data.map(d => d.korcsoport))).sort(),
      nem: Array.from(new Set(data.map(d => d.nem))).sort(),
      webáruház: Array.from(new Set(data.map(d => normalizeStoreName(d.preferalt_webaruhaz)))).sort(),
      vásároltÁru: Array.from(new Set(data.map(d => d.vasarolt_aru))).sort(),
      rendelésiEszköz: Array.from(new Set(data.map(d => d.hasznalt_eszkoz))).sort(),
      fizetésiMód: Array.from(new Set(data.map(d => d.fizetesi_mod))).sort()
    };
  }, [data]);

  // Handlers
  const handleLogin = async () => {
    setError(null);
    try {
      // First try popup
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        setUser(result.user);
      }
    } catch (err: any) {
      console.warn("Popup blocked or failed, falling back to redirect...", err);
      // Fallback to redirect if popup fails/is blocked
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch (redirectErr: any) {
        console.error("Redirect Error:", redirectErr);
        setError(`Hiba történt a bejelentkezés során (${redirectErr.code}): ${redirectErr.message}`);
      }
    }
  };

  const handleDemoLogin = () => {
    setIsDemoMode(true);
    setUser({
      displayName: "Demo Felhasználó",
      email: "demo@behaviorboard.hu",
      photoURL: null
    });
  };

  const handleLogout = () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      setUser(null);
    } else {
      signOut(auth);
    }
  };

  const handleClearFilters = () => {
    setFilters(INITIAL_FILTERS);
    setCurrentPage(1);
  };

  const handleFilterChange = (updater: (prev: FilterOptions) => FilterOptions) => {
    setFilters(updater);
    setCurrentPage(1);
  };

  // Paginated data for table
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  if (loading && !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-deep">
        <div className="text-center">
          <RefreshCcw className="w-10 h-10 animate-spin text-accent-blue mx-auto mb-4" />
          <p className="text-sm font-medium text-text-secondary">Betöltés...</p>
        </div>
      </div>
    );
  }

  // LOGIN PAGE
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-deep font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 bg-bg-card rounded-3xl shadow-2xl border border-border-card text-center"
        >
          <div className="mb-6 inline-flex p-4 bg-accent-blue/10 rounded-2xl">
            <LayoutDashboard className="w-10 h-10 text-accent-blue" />
          </div>
          <h1 id="login-title" className="text-2xl font-bold text-text-primary mb-2">Belépés a BehaviorBoard felületre</h1>
          <p className="text-text-secondary mb-6">Az adatok megtekintéséhez jelentkezz be Google-fiókkal.</p>
          
          {error && (
            <div className="bg-red-400/10 border border-red-400/20 text-red-400 p-4 rounded-xl mb-6 text-sm">
              <p className="font-bold mb-1 flex items-center gap-2 justify-center">
                <RefreshCcw className="w-4 h-4 animate-spin-once" />
                Hiba történt
              </p>
              <p className="opacity-90">{error}</p>
            </div>
          )}
          
          <button 
            id="login-button"
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-accent-blue text-bg-deep py-4 px-6 rounded-2xl font-bold hover:bg-accent-teal hover:scale-[1.02] transition-all shadow-lg shadow-accent-blue/20 active:scale-[0.98] mb-4"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 bg-white rounded-full p-0.5" />
            Bejelentkezés Google-fiókkal
          </button>

          <button 
            id="demo-login-button"
            onClick={handleDemoLogin}
            className="w-full flex items-center justify-center gap-2 bg-transparent text-text-secondary py-3 px-6 rounded-2xl font-semibold border-2 border-border-card hover:border-accent-blue/50 hover:text-text-primary transition-all active:scale-[0.98]"
          >
            <RefreshCcw className="w-4 h-4 text-accent-teal" />
            Teszt mód – belépés demo felhasználóként
          </button>

          <div className="mt-8 pt-6 border-t border-border-card">
            <a href="#" className="text-sm text-text-dim hover:text-accent-blue transition-colors">Súgó és támogatás</a>
          </div>
        </motion.div>
      </div>
    );
  }

  // MAIN DASHBOARD
  return (
    <div className="min-h-screen bg-bg-deep text-text-primary font-sans pb-20">
      {/* HEADER */}
      <header className="bg-bg-card/80 backdrop-blur-md border-b border-border-card sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-accent-blue p-2.5 rounded-xl text-bg-deep shadow-lg shadow-accent-blue/20">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-text-primary">BehaviorBoard</h2>
              <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest leading-none mt-1">Online vásárlói magatartás elemző dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block border-r border-border-card pr-6">
              <p className="text-sm font-bold text-text-primary">{user.displayName || user.email}</p>
              <p className="text-[10px] text-text-dim font-bold uppercase tracking-wider">Mód: {isDemoMode ? 'Teszt' : 'Éles'}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-red-400 hover:bg-red-400/10 rounded-xl transition-all border border-red-400/20"
            >
              <LogOut className="w-4 h-4" />
              Kilépés
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8">
        
        {/* ERROR MESSAGE */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-400/10 border border-red-400/20 text-red-400 p-5 rounded-2xl flex items-center gap-3 mb-6"
            >
              <RefreshCcw className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
              <button 
                onClick={() => setError(null)}
                className="ml-auto text-red-400/60 hover:text-red-400"
              >
                Bezár
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* HERO SECTION */}
        <section className="hero-section grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-8 items-stretch bg-bg-card rounded-[40px] p-8 md:p-12 shadow-2xl border border-border-card relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-blue/5 blur-[100px] -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent-teal/5 blur-[100px] -ml-32 -mb-32"></div>
          
          <div className="space-y-8 relative z-10 flex flex-col justify-center">
            <div className="inline-block self-start px-4 py-2 bg-accent-blue/10 text-accent-blue font-bold text-[10px] uppercase tracking-[.3em] rounded-full border border-accent-blue/20">
              Insight Analízis Platform
            </div>
            <div className="space-y-4">
              <h1 className="text-3xl md:text-5xl xl:text-6xl font-black leading-tight text-text-primary tracking-tight">
                Vásárlói mintázatok<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-blue to-accent-teal">az online térben</span>
              </h1>
              <p className="text-text-secondary text-lg leading-relaxed max-w-xl">
                Professzionális dashboard a vásárlói magatartás, webáruház-preferenciák és visszaküldési dinamikák tudományos igényű elemzéséhez.
              </p>
            </div>
          </div>
          
          <aside className="dashboard-summary-panel relative z-10">
            <div className="bg-bg-deep/50 backdrop-blur-sm rounded-[32px] p-8 border border-border-card h-full">
              <h3 className="text-sm font-bold text-text-primary mb-6 flex items-center gap-2">
                <Info className="w-4 h-4 text-accent-blue" />
                Mit kínálunk az oldalunkon?
              </h3>
              <div className="space-y-6">
                {[
                  { 
                    label: "Valós idejű adatok megjelenítése", 
                    desc: "Firebase-ből betöltött vásárlói adatok dinamikus elemzése.",
                    icon: <RefreshCcw className="w-5 h-5 text-accent-blue" /> 
                  },
                  { 
                    label: "Demográfiai inputokon alapuló elemzések", 
                    desc: "Életkor és nem szerinti vásárlói mintázatok feltárása.",
                    icon: <Users className="w-5 h-5 text-accent-indigo" /> 
                  },
                  { 
                    label: "Trendanalízisek", 
                    desc: "Webáruház-, termék- és fizetési preferenciák összehasonlítása.",
                    icon: <TrendingUp className="w-5 h-5 text-accent-teal" /> 
                  },
                  { 
                    label: "Vásárlói profilok", 
                    desc: "Szűrhető csoportok és értelmezhető vásárlói insightok.",
                    icon: <ShoppingBag className="w-5 h-5 text-accent-amber" /> 
                  }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4 items-start select-none">
                    <div className="p-2 rounded-xl bg-bg-card border border-border-card flex-shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-text-secondary">{item.label}</h4>
                      <p className="text-xs text-text-dim leading-relaxed mt-1">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        {/* KPI CARDS */}
        <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KPICard title="Legnépszerűbb" value={stats.popularStore} label="Webáruház" icon={<ShoppingBag className="w-4 h-4 text-accent-blue" />} />
          <KPICard title="Domináns" value={stats.dominantCategory} label="Kategória" icon={<Box className="w-4 h-4 text-accent-indigo" />} />
          <KPICard title="Leggyakoribb" value={stats.commonPayment} label="Fizetési módok" icon={<CreditCard className="w-4 h-4 text-accent-teal" />} />
          <KPICard title="Átlagos" value={formatPercent(stats.averageReturnRate)} label="Visszaküldési arány" icon={<RefreshCcw className="w-4 h-4 text-accent-amber" />} />
          <KPICard title="Elsődleges" value={stats.commonDevice} label="Rendelési eszköz" icon={<Smartphone className="w-4 h-4 text-slate-400" />} />
          <KPICard title="Gyakori" value={stats.dominantFrequency} label="Vásárlás" icon={<Calendar className="w-4 h-4 text-accent-blue" />} />
        </section>

        {/* FILTERS PANEL */}
        <section className="bg-bg-card rounded-[32px] p-6 shadow-xl border border-border-card">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 px-2">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-bg-deep rounded-2xl border border-border-card">
                <Filter className="w-5 h-5 text-accent-blue" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">Adatfinomítás</h3>
                <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest">Szűrők alkalmazása az elemzésekhez</p>
              </div>
            </div>
            <button 
              onClick={handleClearFilters}
              className="text-xs font-bold text-accent-blue hover:text-accent-teal transition-colors flex items-center gap-2 bg-accent-blue/5 px-4 py-2 rounded-xl border border-accent-blue/10"
            >
              <RefreshCcw className="w-4 h-4" />
              Összes törlése
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <FilterSelect 
              label="Életkor" 
              value={filters.korcsoport} 
              options={filterOptions.életkor} 
              onChange={(v) => handleFilterChange(prev => ({...prev, korcsoport: v}))} 
            />
            <FilterSelect 
              label="Nem" 
              value={filters.nem} 
              options={filterOptions.nem} 
              onChange={(v) => handleFilterChange(prev => ({...prev, nem: v}))} 
            />
            <FilterSelect 
              label="Webáruház" 
              value={filters.webáruház} 
              options={filterOptions.webáruház} 
              onChange={(v) => handleFilterChange(prev => ({...prev, webáruház: v}))} 
            />
            <FilterSelect 
              label="Vásárolt áru" 
              value={filters.vásároltÁru} 
              options={filterOptions.vásároltÁru} 
              onChange={(v) => handleFilterChange(prev => ({...prev, vásároltÁru: v}))} 
            />
            <FilterSelect 
              label="Rendelési eszköz" 
              value={filters.rendelésiEszköz} 
              options={filterOptions.rendelésiEszköz} 
              onChange={(v) => handleFilterChange(prev => ({...prev, rendelésiEszköz: v}))} 
            />
            <FilterSelect 
              label="Fizetési mód" 
              value={filters.fizetésiMód} 
              options={filterOptions.fizetésiMód} 
              onChange={(v) => handleFilterChange(prev => ({...prev, fizetésiMód: v}))} 
            />
          </div>
        </section>

        {/* CHARTS GRID */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ChartCard 
            title="Életkor × Nem × Webáruház" 
            subtitle="Platform-preferenciák demográfiai szegmentációja"
            interpretation="A 100%-os halmozott eloszlás rávilágít az egyes demográfiai szegmensek webáruház-választási arányaira, segítve a célzott marketing-optimalizációt."
          >
            <AgeGenderStoreChart data={filteredData} filters={filters} />
          </ChartCard>
          
          <ChartCard 
            title="Életkor × Nem × Vásárolt áru" 
            subtitle="Termékkosár-összetétel demográfiai fókuszban"
            interpretation="Az egyes csoportok fogyasztási szerkezetének elemzése. Konkrét szegmens választása esetén megoszlási gyűrűdiagram jelenik meg."
          >
            <AgeGenderCategoryChart data={filteredData} filters={filters} />
          </ChartCard>

          <ChartCard 
            title="Életkor × Nem × Rendelési eszköz" 
            subtitle="Technológiai platform-használat elemzése"
            interpretation="Összehasonlító elemzés a Mobil, Tablet és Laptop használatáról, amely rávilágít a platform-specifikus vásárlói szokásokra."
          >
            <AgeGenderDeviceChart data={filteredData} />
          </ChartCard>

          <ChartCard 
            title="Webáruház × Visszaküldési arány" 
            subtitle="Logisztikai hatékonyság és reklamációs ráta"
            interpretation="A vízszintes összehasonlítás a piaci átlaghoz (benchmark) képest mutatja az egyes platformok visszaküldési kockázatát. Az értékek az aktuális szűrés átlagait tükrözik."
          >
            <StoreReturnRateChart data={filteredData} />
          </ChartCard>

          <div className="lg:col-span-2">
            <ChartCard 
              title="Költési sáv és termékkategória kapcsolata" 
              subtitle="Nem, életkor, havi költés és vásárolt áru összefüggése"
              interpretation="Az elemzés azt mutatja meg, hogy az egyes demográfiai csoportokban a havi költési sáv hogyan kapcsolódik a vásárolt termékkategóriákhoz."
            >
              <SpendingCategoryAnalysis data={filteredData} filters={filters} />
            </ChartCard>
          </div>
        </section>

        {/* RETURN RATE ANALYSIS SECTION */}
        <section className="bg-bg-card rounded-[40px] p-8 md:p-10 shadow-2xl border border-border-card space-y-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-blue via-accent-teal to-accent-indigo"></div>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-400/10 rounded-xl">
                  <RefreshCcw className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-text-primary">Életkor × Nem × Visszaküldési arány</h3>
              </div>
              <p className="text-sm text-text-secondary font-medium pl-1">A visszaküldési arány különböző vásárlói, termék- és webáruház-dimenziók mentén vizsgálható.</p>
            </div>
            
            <div className="w-full md:w-72 space-y-2">
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] ml-1">Elemzési szempont</label>
              <div className="relative">
                <select 
                  value={returnRateDimension}
                  onChange={(e) => setReturnRateDimension(e.target.value)}
                  className="w-full bg-bg-deep border border-border-card rounded-2xl px-5 py-3 text-sm font-bold text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/20 appearance-none cursor-pointer hover:bg-bg-card-hover transition-all"
                >
                  <option value="Nem × Életkor">Nem × Életkor</option>
                  <option value="Vásárolt áru">Vásárolt áru</option>
                  <option value="Webáruház">Webáruház</option>
                  <option value="Fizetési mód">Fizetési mód</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-accent-blue">
                  <Filter className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-bg-deep rounded-[32px] p-8 border border-border-card h-[450px] relative shadow-inner">
            <ReturnRateAnalysisChart data={filteredData} dimension={returnRateDimension} />
          </div>

          <div className="p-5 bg-accent-blue/5 rounded-2xl border border-accent-blue/10 flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-accent-blue/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 text-accent-blue" />
            </div>
            <div>
              <p className="text-xs font-bold text-text-primary uppercase tracking-wider mb-1 text-accent-blue">Automatikus elemzési megjegyzés</p>
              <p className="text-sm text-text-secondary leading-relaxed">
                A fenti diagram a visszaküldési arány megoszlását mutatja a választott <strong>{returnRateDimension}</strong> dimenzió alapján. 
                A kiugró értékek (borostyán árnyalatok) rávilágíthatnak a logisztikai vagy minőségbiztosítási folyamatok gyenge pontjaira.
              </p>
            </div>
          </div>
        </section>

        {/* INSIGHTS */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <TrendingUp className="w-6 h-6 text-accent-blue" />
            <div className="space-y-0.5">
              <h3 className="text-xl font-bold text-text-primary">Főbb megállapítások</h3>
              <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest">Automatikus trend-analízis eredményei</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InsightCard 
                text={`A legnépszerűbb platform jelenleg: ${stats.popularStore}.`} 
                color="bg-accent-blue/5 text-accent-blue" 
              />
              <InsightCard 
                text={`Domináns kategória: ${stats.dominantCategory}.`} 
                color="bg-accent-indigo/5 text-accent-indigo" 
              />
              <InsightCard 
                text={`Rendelési eszköz: ${stats.commonDevice}.`} 
                color="bg-slate-400/5 text-slate-400" 
              />
              <InsightCard 
                text={`Visszaküldési arányok: ${formatPercent(stats.averageReturnRate)}.`} 
                color="bg-amber-400/5 text-amber-500" 
              />
            </div>
            <div className="lg:col-span-4">
              <div className="bg-bg-card rounded-[32px] p-6 border border-border-card h-full flex flex-col">
                <h4 className="text-[10px] font-bold text-text-dim uppercase tracking-widest mb-4">Leggyakoribb fizetési módok</h4>
                <div className="flex-1 min-h-[180px]">
                  <PaymentMethodChart data={filteredData} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* DATA TABLE */}
        <section className="bg-bg-card rounded-[40px] p-8 shadow-2xl border border-border-card overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-6">
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-text-primary">Részletes adatok</h3>
              <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest">Részletes vásárlói adatok és paraméterek</p>
            </div>
            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim group-focus-within:text-accent-blue transition-colors" />
              <input 
                type="text" 
                placeholder="Keresés az adatokban (ID, áruház, termék)..." 
                className="w-full pl-12 pr-4 py-3 bg-bg-deep border border-border-card rounded-2xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue/40 transition-all font-medium placeholder:text-text-dim"
                value={filters.searchTerm}
                onChange={(e) => handleFilterChange(prev => ({...prev, searchTerm: e.target.value}))}
              />
            </div>
          </div>

          <div className="overflow-x-auto -mx-8">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-bg-deep/50">
                  <th className="px-8 py-4 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Azonosító</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Életkor</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Nem</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Webáruház</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] text-right">Költés</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Eszköz</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Fizetés</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Gyakoriság</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em] text-center">Visszaküldési arány</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-text-dim uppercase tracking-[0.2em]">Áru</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {paginatedData.length > 0 ? (
                  paginatedData.map((row) => (
                    <tr key={row.id} className="hover:bg-bg-card-hover transition-colors group">
                      <td className="px-8 py-4 text-xs font-mono font-medium text-text-dim group-hover:text-text-secondary">{row.felhasznalo_azonosito}</td>
                      <td className="px-8 py-4 text-sm font-medium text-text-secondary">{row.korcsoport}</td>
                      <td className="px-8 py-4 text-sm font-bold">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${row.nem === 'Férfi' ? 'bg-accent-blue/10 text-accent-blue' : 'bg-accent-indigo/10 text-accent-indigo'}`}>
                          {row.nem}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-sm font-bold text-text-primary">{normalizeStoreName(row.preferalt_webaruhaz)}</td>
                      <td className="px-8 py-4 text-sm font-mono font-bold text-right text-accent-teal">{row.atlagos_havi_koltes_inr} <span className="text-[10px] font-normal text-text-dim">INR</span></td>
                      <td className="px-8 py-4 text-sm font-medium text-text-secondary">{formatDisplay(row.hasznalt_eszkoz)}</td>
                      <td className="px-8 py-4 text-sm font-medium text-text-dim">{row.fizetesi_mod}</td>
                      <td className="px-8 py-4 text-sm font-medium text-text-dim">{row.vasarlasi_gyakorisag}</td>
                      <td className="px-8 py-4 text-sm text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-black ${parseReturnRate(row.visszakuldesi_arany_szazalek) > 15 ? 'text-red-400 bg-red-400/10' : 'text-accent-teal bg-accent-teal/10'}`}>
                          {formatPercent(parseReturnRate(row.visszakuldesi_arany_szazalek))}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-sm font-medium text-text-secondary">{row.vasarolt_aru}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="px-8 py-16 text-center text-text-dim font-medium italic bg-bg-deep/20">
                      Nincs megjeleníthető adat a kiválasztott szűrők alapján.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION CONTROLS */}
          {filteredData.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between mt-8 gap-6 border-t border-border-card pt-8">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-text-dim font-bold uppercase tracking-widest whitespace-nowrap">Oldalméret</span>
                  <div className="flex gap-1 bg-bg-deep p-1 rounded-xl border border-border-card">
                    {[5, 10, 25].map(size => (
                      <button
                        key={size}
                        onClick={() => {
                          setPageSize(size);
                          setCurrentPage(1);
                        }}
                        className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all ${pageSize === size ? 'bg-accent-blue text-bg-deep shadow-lg' : 'text-text-dim hover:text-text-primary'}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-text-dim font-bold uppercase tracking-wider">
                  <span className="text-accent-blue">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredData.length)}.</span> vásárló megjelenítése, összesen <span className="text-text-secondary">{filteredData.length}</span> főből
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-2 px-4 py-2 text-[10px] font-black rounded-xl border border-border-card hover:border-accent-blue/50 hover:bg-bg-card-hover text-text-dim hover:text-text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-all uppercase tracking-widest"
                >
                  <Filter className="w-3 h-3 rotate-180" />
                  Előző
                </button>
                
                <div className="text-xs font-black text-text-primary bg-bg-deep px-4 py-2 rounded-xl border border-border-card">
                  {currentPage} / {Math.max(1, Math.ceil(filteredData.length / pageSize))}
                </div>

                <button 
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredData.length / pageSize), prev + 1))}
                  disabled={currentPage >= Math.ceil(filteredData.length / pageSize)}
                  className="flex items-center gap-2 px-4 py-2 text-[10px] font-black rounded-xl border border-border-card hover:border-accent-blue/50 hover:bg-bg-card-hover text-text-dim hover:text-text-primary disabled:opacity-20 disabled:cursor-not-allowed transition-all uppercase tracking-widest"
                >
                  Következő
                  <Filter className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// SUB-COMPONENTS

function KPICard({ title, value, label, icon }: { title: string, value: string | number, label: string, icon: React.ReactNode }) {
  return (
    <div 
      className="bg-bg-card p-4 rounded-2xl shadow-xl border border-border-card flex flex-col gap-3 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-12 h-12 bg-accent-blue/5 blur-2xl"></div>
      <div className="flex items-center justify-between relative z-10">
        <div className="p-2 bg-bg-deep rounded-xl border border-border-card">{icon}</div>
        <div className="w-1 h-1 rounded-full bg-accent-blue/20"></div>
      </div>
      <div className="relative z-10">
        <p className="text-[9px] font-bold text-text-dim uppercase tracking-[0.1em] mb-1">{title}</p>
        <p className="text-base font-black text-text-primary tracking-tight truncate leading-none">{value}</p>
        <p className="text-[9px] font-bold text-accent-blue/80 uppercase tracking-widest mt-1">{label}</p>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string, value: string, options: string[], onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest ml-1">{label}</label>
      <div className="relative group">
        <select 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-bg-deep border border-border-card rounded-2xl px-4 py-2.5 text-xs font-bold text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue/50 appearance-none cursor-pointer hover:bg-bg-card-hover hover:text-text-primary transition-all pr-10"
        >
          <option value="" className="bg-bg-card">Mindegyik</option>
          {options.map(opt => (
            <option key={opt} value={opt} className="bg-bg-card">{formatDisplay(opt)}</option>
          ))}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text-dim group-hover:text-accent-blue transition-colors">
          <Filter className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, interpretation }: { title: string; subtitle: string; children: React.ReactNode; interpretation?: string }) {
  return (
    <div className="bg-bg-card rounded-[40px] p-8 shadow-2xl border border-border-card flex flex-col h-full min-h-[480px] group transition-all hover:shadow-accent-blue/5 overflow-hidden">
      <div className="mb-8 flex justify-between items-start relative z-10">
        <div className="space-y-1.5">
          <h3 className="text-xl font-bold tracking-tight text-text-primary group-hover:text-accent-blue transition-colors">{title}</h3>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-[0.2em]">{subtitle}</p>
        </div>
        <div className="w-11 h-11 rounded-2xl bg-bg-deep border border-border-card flex items-center justify-center shadow-lg">
          <ChartBar className="w-5 h-5 text-text-dim group-hover:text-accent-blue transition-colors" />
        </div>
      </div>
      <div className="flex-1 min-h-[280px] relative mb-6 z-10">
        {children}
      </div>
      <div className="pt-6 border-t border-border-card relative z-10">
        <div className="flex items-start gap-3">
          <div className="p-1.5 bg-accent-blue/10 rounded-lg">
            <Info className="w-3.5 h-3.5 text-accent-blue" />
          </div>
          <p className="text-xs text-text-secondary leading-relaxed italic group-hover:text-text-primary transition-colors">
            {interpretation || "A diagram az aktuális szűrés alapján számított megoszlásokat mutatja."}
          </p>
        </div>
      </div>
      <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-accent-blue/5 blur-[80px] group-hover:bg-accent-blue/10 rounded-full transition-all"></div>
    </div>
  );
}

function InsightCard({ text, color }: { text: string; color: string }) {
  return (
    <div className={`p-4 rounded-2xl border border-current border-opacity-10 shadow-sm font-medium text-sm leading-relaxed ${color}`}>
      {text}
    </div>
  );
}

const AGE_GENDER_GROUPS = [
  "0-18 / Férfi", "0-18 / Nő",
  "19-30 / Férfi", "19-30 / Nő",
  "31-50 / Férfi", "31-50 / Nő"
];

const DASHBOARD_COLORS = [
  'rgba(96, 165, 250, 0.7)',  // #60A5FA (sky blue)
  'rgba(37, 99, 235, 0.65)',  // #2563EB (blue)
  'rgba(15, 118, 110, 0.7)',  // #0F766E (teal)
  'rgba(99, 102, 241, 0.6)',  // #6366F1 (indigo)
  'rgba(100, 116, 139, 0.7)', // #64748B (slate)
  'rgba(180, 83, 9, 0.75)',   // #B45309 (amber)
];

function PaymentMethodChart({ data }: { data: PurchaseRecord[] }) {
  const methods = ["UPI", "Hitelkártya", "Készpénz átvételkor"];
  const counts = methods.map(m => data.filter(d => d.fizetesi_mod === m).length);
  const total = counts.reduce((a, b) => a + b, 0);

  if (total === 0) return null;

  return (
    <div className="h-full w-full relative">
      <Doughnut 
        data={{
          labels: methods,
          datasets: [{
            data: counts,
            backgroundColor: [DASHBOARD_COLORS[0], DASHBOARD_COLORS[2], DASHBOARD_COLORS[5]],
            borderWidth: 0,
          }]
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { 
              position: 'right', 
              labels: { 
                boxWidth: 8, 
                font: { size: 9 },
                padding: 10
              } 
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.parsed;
                  const pct = ((val / total) * 100).toFixed(1);
                  return `${ctx.label}: ${val} fő (${pct}%)`;
                }
              }
            }
          }
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pr-[40%]">
        <CreditCard className="w-4 h-4 text-accent-blue/40" />
      </div>
    </div>
  );
}

function AgeGenderStoreChart({ data, filters }: { data: PurchaseRecord[], filters: FilterOptions }) {
  const stores = ["Amazon", "Flipkart", "Myntra"];
  
  // If specific age and gender are selected, show a Donut chart of store distribution
  if (filters.korcsoport && filters.nem) {
    const groupData = data.filter(d => d.korcsoport === filters.korcsoport && d.nem === filters.nem);
    const storeCounts = stores.map(store => groupData.filter(d => normalizeStoreName(d.preferalt_webaruhaz) === store).length);
    const total = storeCounts.reduce((a, b) => a + b, 0);

    if (total === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-text-dim font-bold italic uppercase tracking-widest text-[10px]">Nincs elég adat a szegmens elemzéséhez.</p>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col items-center justify-center py-4">
        <div className="w-full h-48 sm:h-56 relative">
          <Doughnut 
            data={{
              labels: stores,
              datasets: [{
                data: storeCounts,
                backgroundColor: [DASHBOARD_COLORS[0], DASHBOARD_COLORS[1], DASHBOARD_COLORS[2]],
                borderWidth: 0,
              }]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: '70%',
              plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10 } } },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const val = ctx.parsed;
                      const pct = ((val / total) * 100).toFixed(1);
                      return `${ctx.label}: ${val} fő (${pct}%)`;
                    }
                  }
                }
              }
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
            <span className="text-[9px] font-bold text-text-dim uppercase tracking-tighter">Top</span>
            <span className="text-sm font-black text-text-primary">{stores[storeCounts.indexOf(Math.max(...storeCounts))]}</span>
          </div>
        </div>
        <p className="text-[10px] text-text-dim italic font-medium mt-4 text-center">A diagram a szegmens webáruház-preferenciáját mutatja.</p>
      </div>
    );
  }

  const activeGroups = AGE_GENDER_GROUPS.filter(label => {
    const [age, gender] = label.split(" / ");
    return data.some(d => d.korcsoport === age && d.nem === gender);
  });

  const chartData = {
    labels: activeGroups,
    datasets: stores.map((store, i) => ({
      label: store,
      data: activeGroups.map(label => {
        const [age, gender] = label.split(" / ");
        const groupData = data.filter(d => d.korcsoport === age && d.nem === gender);
        if (groupData.length === 0) return 0;
        const count = groupData.filter(d => normalizeStoreName(d.preferalt_webaruhaz) === store).length;
        return parseFloat(((count / groupData.length) * 100).toFixed(1));
      }),
      backgroundColor: DASHBOARD_COLORS[i],
      barPercentage: 0.6,
      categoryPercentage: 0.8,
    }))
  };

  return (
    <Bar 
      data={chartData} 
      options={{ 
        responsive: true, 
        maintainAspectRatio: false, 
        scales: { 
          y: { 
            stacked: true,
            beginAtZero: true, 
            max: 100,
            grid: { color: 'rgba(148, 163, 184, 0.05)' },
            title: { display: true, text: 'Részarány (%)', font: { weight: 600, size: 10 } },
            ticks: { callback: (val) => `${val}%` }
          },
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 10 } }
          }
        }, 
        plugins: { 
          legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%`
            }
          }
        } 
      }} 
    />
  );
}

function AgeGenderCategoryChart({ data, filters }: { data: PurchaseRecord[], filters: FilterOptions }) {
  const categories = ["Elektronikai eszközök", "Ruházat", "Élelmiszer"];

  // If specific age and gender are selected, show a Donut chart of category distribution
  if (filters.korcsoport && filters.nem) {
    const groupData = data.filter(d => d.korcsoport === filters.korcsoport && d.nem === filters.nem);
    const catCounts = categories.map(cat => groupData.filter(d => d.vasarolt_aru === cat).length);
    const total = catCounts.reduce((a, b) => a + b, 0);

    if (total === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <p className="text-text-dim font-bold italic uppercase tracking-widest text-[10px]">Nincs elég adat a szegmens elemzéséhez.</p>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col items-center justify-center py-4">
        <div className="w-full h-48 sm:h-56 relative">
          <Doughnut 
            data={{
              labels: categories,
              datasets: [{
                data: catCounts,
                backgroundColor: [DASHBOARD_COLORS[3], DASHBOARD_COLORS[4], DASHBOARD_COLORS[0]],
                borderWidth: 0,
              }]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: '70%',
              plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10 } } },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const val = ctx.parsed;
                      const pct = ((val / total) * 100).toFixed(1);
                      return `${ctx.label}: ${val} fő (${pct}%)`;
                    }
                  }
                }
              }
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
            <span className="text-[9px] font-bold text-text-dim uppercase tracking-tighter">Összesen</span>
            <span className="text-sm font-black text-text-primary">{total} fő</span>
          </div>
        </div>
        <p className="text-[10px] text-text-dim italic font-medium mt-4 text-center">A diagram a szegmens vásárolt áru megoszlását mutatja.</p>
      </div>
    );
  }

  const activeGroups = AGE_GENDER_GROUPS.filter(label => {
    const [age, gender] = label.split(" / ");
    return data.some(d => d.korcsoport === age && d.nem === gender);
  });

  const chartData = {
    labels: activeGroups,
    datasets: categories.map((cat, i) => ({
      label: cat,
      data: activeGroups.map(label => {
        const [age, gender] = label.split(" / ");
        const groupData = data.filter(d => d.korcsoport === age && d.nem === gender);
        if (groupData.length === 0) return 0;
        const count = groupData.filter(d => d.vasarolt_aru === cat).length;
        return parseFloat(((count / groupData.length) * 100).toFixed(1));
      }),
      backgroundColor: DASHBOARD_COLORS[i % DASHBOARD_COLORS.length],
      barPercentage: 0.6,
      categoryPercentage: 0.8,
    }))
  };

  return (
    <Bar 
      data={chartData} 
      options={{ 
        responsive: true, 
        maintainAspectRatio: false, 
        scales: { 
          y: { 
            stacked: true,
            beginAtZero: true, 
            max: 100,
            grid: { color: 'rgba(148, 163, 184, 0.05)' },
            title: { display: true, text: 'Részarány (%)', font: { weight: 600, size: 10 } },
            ticks: { callback: (val) => `${val}%` }
          },
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 10 } }
          }
        }, 
        plugins: { 
          legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%`
            }
          }
        } 
      }} 
    />
  );
}

function BenchmarkBarChart({ items, benchmarkAverage }: { items: { label: string, value: number, count: number }[], benchmarkAverage: number }) {
  const maxValue = Math.max(
    ...items.map(item => item.value),
    benchmarkAverage
  );

  const chartMax = Math.max(5, Math.ceil((maxValue + 5) / 5) * 5);

  const benchmarkPosition = (benchmarkAverage / chartMax) * 100;

  return (
    <div className="h-full w-full flex flex-col justify-between py-2 relative">
      {/* Background Grid Rules */}
      <div className="absolute top-0 bottom-12 right-0 left-32 flex justify-between pointer-events-none opacity-5">
        {[0, 25, 50, 75, 100].map(p => (
          <div key={p} className="h-full w-px bg-slate-400"></div>
        ))}
      </div>

      <div className="flex-1 flex flex-col justify-around gap-2">
        {items.map((item, idx) => {
          const barWidth = (item.value / chartMax) * 100;
          const diff = item.value - benchmarkAverage;
          const diffStr = diff >= 0 ? `+${diff.toFixed(1).replace(".", ",")}` : diff.toFixed(1).replace(".", ",");
          
          return (
            <div key={idx} className="relative group/bar flex items-center h-full max-h-12 min-h-6">
               <div className="w-32 flex-shrink-0 text-[10px] font-bold text-text-secondary truncate pr-3 text-right">
                  {formatDisplay(item.label)}
               </div>
               <div className="flex-1 h-full max-h-8 bg-bg-deep/30 rounded-lg relative overflow-visible">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={`h-full rounded-lg relative flex items-center justify-end px-2 ${item.value > benchmarkAverage ? 'bg-accent-amber/70' : 'bg-accent-blue/60'}`}
                  >
                    <span className="text-[9px] font-black text-bg-deep whitespace-nowrap drop-shadow-sm opacity-0 group-hover/bar:opacity-100 transition-opacity">
                      {formatPercent(item.value)}
                    </span>
                  </motion.div>
                  
                  {/* Floating label for value if not hovered */}
                  <div 
                    className="absolute left-full ml-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-text-primary opacity-100 group-hover/bar:opacity-0 transition-opacity whitespace-nowrap"
                    style={{ left: `${barWidth}%` }}
                  >
                    {formatPercent(item.value)}
                  </div>

                  {/* Custom Tooltip on group hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-56 p-4 bg-bg-card border border-border-card rounded-2xl shadow-2xl opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-all z-50 translate-y-2 group-hover/bar:translate-y-0 backdrop-blur-md">
                    <p className="text-[11px] font-black text-text-primary mb-2 uppercase tracking-wider border-b border-border-card pb-2">{formatDisplay(item.label)}</p>
                    <div className="space-y-2 text-[10px]">
                      <div className="flex justify-between items-center">
                        <span className="text-text-dim">Visszaküldési arány:</span>
                        <span className="font-bold text-text-primary">{formatPercent(item.value)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-text-dim">Elemzett vásárlók:</span>
                        <span className="font-bold text-text-primary">{item.count} fő</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-border-card">
                        <span className="text-text-dim">Eltérés az átlagtól:</span>
                        <span className={`font-black px-1.5 py-0.5 rounded ${diff >= 0 ? 'bg-red-400/10 text-red-400' : 'bg-accent-teal/10 text-accent-teal'}`}>
                          {diffStr} százalékpont
                        </span>
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          );
        })}
      </div>

      {/* Benchmark Line */}
      {benchmarkAverage > 0 && (
        <div 
          className="absolute top-0 bottom-8 w-[2px] bg-slate-400 opacity-60 z-10 pointer-events-none"
          style={{ left: `calc(128px + (100% - 128px) * ${benchmarkPosition / 100})` }}
        >
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-bg-card/90 backdrop-blur-md text-text-dim text-[8px] px-2 py-0.5 rounded-lg border border-border-card font-black whitespace-nowrap shadow-sm">
            ÁTLAG: {formatPercent(benchmarkAverage)}
          </div>
        </div>
      )}

      {/* Scale indicators at bottom */}
      <div className="flex justify-between pl-32 pt-3 border-t border-border-card mt-2 relative z-20">
         {[0, 25, 50, 75, 100].map(p => (
           <span key={p} className="text-[8px] font-bold text-text-dim">{(p * chartMax / 100).toFixed(0)}%</span>
         ))}
      </div>
    </div>
  );
}

function AgeGenderDeviceChart({ data }: { data: PurchaseRecord[] }) {
  const devices = ["Laptop", "Mobile", "Tablet"];

  const activeGroups = AGE_GENDER_GROUPS.filter(label => {
    const [age, gender] = label.split(" / ");
    return data.some(d => d.korcsoport === age && d.nem === gender);
  });

  const chartData = {
    labels: activeGroups,
    datasets: devices.map((dev, i) => ({
      label: formatDisplay(dev),
      data: activeGroups.map(label => {
        const [age, gender] = label.split(" / ");
        return data.filter(d => d.korcsoport === age && d.nem === gender && d.hasznalt_eszkoz === dev).length;
      }),
      backgroundColor: DASHBOARD_COLORS[i % DASHBOARD_COLORS.length],
      borderRadius: 4,
      barPercentage: 0.8,
      categoryPercentage: 0.6,
    }))
  };

  return (
    <Bar 
      data={chartData} 
      options={{ 
        responsive: true, 
        maintainAspectRatio: false, 
        scales: { 
          x: { 
            grid: { display: false },
            ticks: { font: { size: 10 } }
          },
          y: { 
            beginAtZero: true, 
            grid: { color: 'rgba(148, 163, 184, 0.05)' },
            title: { display: true, text: 'Darabszám (fő)', font: { weight: 600, size: 10 } },
            ticks: { font: { size: 10 } }
          }
        }, 
        plugins: { 
          legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} fő`
            }
          }
        } 
      }} 
    />
  );
}

function StoreReturnRateChart({ data }: { data: PurchaseRecord[] }) {
  const stores = ["Amazon", "Flipkart", "Myntra"];
  
  const storeReturnRates = stores.map(store => {
    const storeRecords = data.filter(d => normalizeStoreName(d.preferalt_webaruhaz) === store);
    return {
      label: store,
      value: averageReturnRate(storeRecords),
      count: storeRecords.length
    };
  }).filter(item => item.count > 0);

  const benchmarkAverage = averageReturnRate(data);

  console.table(storeReturnRates);
  console.log("Store benchmark average:", benchmarkAverage);
  console.log("Amazon:", storeReturnRates.find(item => item.label === "Amazon"));
  console.log("Flipkart:", storeReturnRates.find(item => item.label === "Flipkart"));
  console.log("Myntra:", storeReturnRates.find(item => item.label === "Myntra"));

  return (
    <div className="h-full">
      <BenchmarkBarChart items={storeReturnRates} benchmarkAverage={benchmarkAverage} />
    </div>
  );
}

const SPENDING_RANGES = ["1000-5000", "5000-10000", "10000+"];
const CATEGORIES = ["Elektronikai eszközök", "Ruházat", "Élelmiszer"];

function SpendingCategoryAnalysis({ data, filters }: { data: PurchaseRecord[], filters: FilterOptions }) {
  const hasAgeGenderFilter = !!(filters.korcsoport && filters.nem);
  const hasCategoryFilter = !!filters.vásároltÁru;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-dim font-bold italic uppercase tracking-widest text-[10px]">Nincs elég adat a költési sáv és termékkategória kapcsolatának megjelenítéséhez.</p>
      </div>
    );
  }

  // State 3: Specific Gender, Age, and Category selected -> Donut Chart
  if (hasAgeGenderFilter && hasCategoryFilter) {
    const counts = SPENDING_RANGES.map(range => 
      data.filter(d => d.atlagos_havi_koltes_inr === range).length
    );
    const total = counts.reduce((a, b) => a + b, 0);

    return (
      <div className="h-full flex flex-col items-center justify-center py-4">
        <div className="w-full h-48 sm:h-64 relative">
          <Doughnut 
            data={{
              labels: SPENDING_RANGES,
              datasets: [{
                data: counts,
                backgroundColor: [DASHBOARD_COLORS[0], DASHBOARD_COLORS[2], DASHBOARD_COLORS[5]],
                borderWidth: 0,
              }]
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: '70%',
              plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10 } } },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const val = ctx.parsed;
                      const pct = ((val / total) * 100).toFixed(1);
                      return `${ctx.label}: ${val} fő (${pct}%)`;
                    }
                  }
                }
              }
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
            <span className="text-[8px] font-black text-text-dim uppercase tracking-widest">Költési sáv</span>
            <span className="text-sm font-black text-text-primary">{filters.vásároltÁru}</span>
          </div>
        </div>
        <p className="text-[10px] text-text-dim italic font-medium mt-4 text-center">Megoszlás a választott termékkategóriára fókuszálva.</p>
      </div>
    );
  }

  // State 2: Specific Gender and Age selected -> 100% Stacked Bar
  if (hasAgeGenderFilter) {
    const chartData = {
      labels: SPENDING_RANGES,
      datasets: CATEGORIES.map((cat, i) => ({
        label: cat,
        data: SPENDING_RANGES.map(range => {
          const rangeData = data.filter(d => d.atlagos_havi_koltes_inr === range);
          if (rangeData.length === 0) return 0;
          const count = rangeData.filter(d => d.vasarolt_aru === cat).length;
          return parseFloat(((count / rangeData.length) * 100).toFixed(1));
        }),
        backgroundColor: DASHBOARD_COLORS[i % DASHBOARD_COLORS.length],
        barPercentage: 0.6,
        categoryPercentage: 0.8,
      }))
    };

    return (
      <div className="h-full pt-4">
        <Bar 
          data={chartData} 
          options={{ 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { 
              y: { 
                stacked: true,
                beginAtZero: true, 
                max: 100,
                grid: { color: 'rgba(148, 163, 184, 0.05)' },
                title: { display: true, text: 'Részarány (%)', font: { weight: 600, size: 10 } },
                ticks: { callback: (val) => `${val}%` }
              },
              x: {
                stacked: true,
                grid: { display: false },
                ticks: { font: { size: 10, weight: 600 } },
                title: { display: true, text: 'Havi költési sáv (INR)', font: { weight: 600, size: 10 } }
              }
            }, 
            plugins: { 
              legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10 } } },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%`
                }
              }
            } 
          }} 
        />
      </div>
    );
  }

  // State 1: No specific Gender/Age filter -> Heatmap/Matrix
  const rows = AGE_GENDER_GROUPS.filter(group => {
    const [age, gender] = group.split(" / ");
    return data.some(d => d.korcsoport === age && d.nem === gender);
  });

  return (
    <div className="h-full flex flex-col py-2">
      <div className="overflow-x-auto pb-4 custom-scrollbar">
        <div className="min-w-[500px]">
          {/* Header Row */}
          <div className="grid grid-cols-[140px_1fr_1fr_1fr] gap-2 mb-2">
            <div className="text-[9px] font-black text-text-dim uppercase tracking-[0.15em] flex items-end pb-2">Demográfia</div>
            {SPENDING_RANGES.map(range => (
              <div key={range} className="text-[9px] font-black text-text-dim uppercase tracking-[0.15em] text-center bg-bg-deep/50 py-2 rounded-lg border border-border-card">
                {range} <span className="text-[7px] opacity-60">INR</span>
              </div>
            ))}
          </div>

          {/* Data Rows */}
          <div className="space-y-2">
            {rows.map(row => (
              <div key={row} className="grid grid-cols-[140px_1fr_1fr_1fr] gap-2">
                <div className="text-[10px] font-bold text-text-secondary flex items-center px-1">
                  {row}
                </div>
                {SPENDING_RANGES.map(range => {
                  const [age, gender] = row.split(" / ");
                  const cellRecords = data.filter(d => 
                    d.korcsoport === age && 
                    d.nem === gender && 
                    d.atlagos_havi_koltes_inr === range
                  );
                  
                  const count = cellRecords.length;
                  const intensities = [0, 5, 10, 25, 50]; // Opacity levels
                  const intensityIdx = intensities.findIndex((limit, i) => 
                    count <= limit || i === intensities.length - 1
                  );
                  const opacity = 0.05 + (intensityIdx * 0.15);
                  
                  // Dominant category
                  const counts: Record<string, number> = {};
                  cellRecords.forEach(r => counts[r.vasarolt_aru] = (counts[r.vasarolt_aru] || 0) + 1);
                  const dominant = count > 0 ? Object.entries(counts).reduce((a, b) => b[1] > a[1] ? b : a)[0] : null;

                  return (
                    <div 
                      key={`${row}-${range}`}
                      className="relative h-14 rounded-xl border border-border-card flex flex-col items-center justify-center group overflow-hidden"
                      style={{ backgroundColor: count > 0 ? `rgba(96, 165, 250, ${opacity})` : 'transparent' }}
                    >
                      {count > 0 ? (
                        <>
                          <span className="text-xs font-black text-text-primary">{count}</span>
                          <span className="text-[8px] font-medium text-text-dim truncate px-1 max-w-full">
                            {dominant === "Elektronikai eszközök" ? "Elektronika" : dominant}
                          </span>
                        </>
                      ) : (
                        <span className="text-[8px] text-text-dim/20 font-black italic">Nincs adat</span>
                      )}
                      
                      {/* Custom Tooltip on Hover */}
                      <div className="absolute inset-0 z-20 opacity-0 group-hover:opacity-100 bg-bg-deep/95 backdrop-blur-sm p-2 flex flex-col justify-center items-center pointer-events-none transition-all border border-accent-blue/30 rounded-xl">
                        <p className="text-[8px] font-black text-accent-blue uppercase tracking-widest leading-none mb-1">{range} INR</p>
                        <p className="text-[10px] font-bold text-text-primary leading-none mb-2">{row}</p>
                        <div className="w-full space-y-1">
                          {CATEGORIES.map(cat => {
                            const catCount = cellRecords.filter(r => r.vasarolt_aru === cat).length;
                            if (catCount === 0) return null;
                            return (
                              <div key={cat} className="flex justify-between items-center gap-2">
                                <span className="text-[8px] text-text-dim truncate">{cat === "Elektronikai eszközök" ? "Elektronika" : cat}</span>
                                <span className="text-[8px] font-bold text-text-secondary">{catCount} fő</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-auto pt-2 flex items-center justify-end gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded bg-blue-500/10 border border-blue-500/20"></div>
          <span className="text-[9px] font-bold text-text-dim uppercase">Kevés vásárló</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded bg-blue-500/60 shadow-lg shadow-blue-500/10"></div>
          <span className="text-[9px] font-bold text-text-dim uppercase">Magas sűrűség</span>
        </div>
      </div>
    </div>
  );
}

function ReturnRateAnalysisChart({ data, dimension }: { data: PurchaseRecord[], dimension: string }) {
  const benchmarkAverage = averageReturnRate(data);

  let items: { label: string, value: number, count: number }[] = [];

  if (dimension === "Nem × Életkor") {
    const groups = [
      { age: "0-18", gender: "Férfi" },
      { age: "0-18", gender: "Nő" },
      { age: "19-30", gender: "Férfi" },
      { age: "19-30", gender: "Nő" },
      { age: "31-50", gender: "Férfi" },
      { age: "31-50", gender: "Nő" }
    ];
    items = groups.map(g => {
      const records = data.filter(d => d.korcsoport === g.age && d.nem === g.gender);
      return {
        label: `${g.age} / ${g.gender}`,
        value: averageReturnRate(records),
        count: records.length
      };
    }).filter(i => i.count > 0);

    const demographicReturnRates = items;
    console.table(demographicReturnRates);
    console.log("Demographic benchmark average:", benchmarkAverage);
    console.log("0-18 / Nő:", demographicReturnRates.find(item => item.label === "0-18 / Nő"));
    console.log("19-30 / Férfi:", demographicReturnRates.find(item => item.label === "19-30 / Férfi"));
    console.log("19-30 / Nő:", demographicReturnRates.find(item => item.label === "19-30 / Nő"));
    console.log("31-50 / Nő:", demographicReturnRates.find(item => item.label === "31-50 / Nő"));
  } else if (dimension === "Vásárolt áru") {
    const categories = ["Elektronikai eszközök", "Ruházat", "Élelmiszer"];
    items = categories.map(cat => {
      const records = data.filter(d => d.vasarolt_aru === cat);
      return {
        label: cat,
        value: averageReturnRate(records),
        count: records.length
      };
    }).filter(i => i.count > 0);
  } else if (dimension === "Webáruház") {
    const stores = ["Amazon", "Flipkart", "Myntra"];
    items = stores.map(s => {
      const records = data.filter(d => normalizeStoreName(d.preferalt_webaruhaz) === s);
      return {
        label: s,
        value: averageReturnRate(records),
        count: records.length
      };
    }).filter(i => i.count > 0);
  } else if (dimension === "Fizetési mód") {
    const methods = ["UPI", "Hitelkártya", "Készpénz átvételkor"];
    items = methods.map(m => {
      const records = data.filter(d => d.fizetesi_mod === m);
      return {
        label: m,
        value: averageReturnRate(records),
        count: records.length
      };
    }).filter(i => i.count > 0);
  }

  const hasData = items.length > 0;

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-deep/30 rounded-3xl border-2 border-dashed border-border-card">
        <p className="text-text-dim font-bold italic uppercase tracking-widest text-sm">Nincs elég adat a kiválasztott elemzéshez.</p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <BenchmarkBarChart items={items} benchmarkAverage={benchmarkAverage} />
    </div>
  );
}

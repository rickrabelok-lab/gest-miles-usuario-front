import { User, Menu, X, Zap } from "lucide-react";
import { useState } from "react";

const DashboardHeader = () => {
  const [bannerVisible, setBannerVisible] = useState(true);

  return (
    <div className="bg-header text-header-foreground">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <button className="flex items-center gap-2 rounded-full bg-header-foreground/15 px-3 py-1.5 text-sm font-medium backdrop-blur-sm">
          <User size={16} />
          <span>RR</span>
        </button>
        <h1 className="font-display text-xl font-bold tracking-tight">MilesHub</h1>
        <button className="rounded-lg p-1.5">
          <Menu size={22} />
        </button>
      </div>

      {/* Promo banner */}
      {bannerVisible && (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-header-foreground/10 px-4 py-2.5 backdrop-blur-sm">
          <Zap size={18} className="shrink-0 text-warning" />
          <p className="flex-1 text-sm">
            Bônus de até <span className="font-bold text-warning">133%</span> na transferência. Confira
          </p>
          <button onClick={() => setBannerVisible(false)} className="shrink-0 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default DashboardHeader;

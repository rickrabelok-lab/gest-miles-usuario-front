import { Plane } from "lucide-react";
import destBrasil from "@/assets/dest-brasil.jpg";
import destSudeste from "@/assets/dest-sudeste.jpg";
import destUSA from "@/assets/dest-usa.jpg";
import destPortugal from "@/assets/dest-portugal.jpg";

const destinations = [
  { name: "Brasil", image: destBrasil, miles: "8.000", price: "220" },
  { name: "Sudeste", image: destSudeste, miles: "6.500", price: "180" },
  { name: "EUA", image: destUSA, miles: "35.000", price: "1.200" },
  { name: "Portugal", image: destPortugal, miles: "42.000", price: "1.800" },
];

const ExploreDestinations = () => {
  return (
    <div className="px-5 py-4">
      <div className="rounded-2xl bg-card p-5 card-miles">
        <div className="flex items-center gap-2 mb-1">
          <Plane size={16} className="text-primary" />
          <p className="text-xs text-muted-foreground">BHZ · SAO</p>
        </div>
        <h2 className="font-display text-xl font-bold text-foreground">Explorar destinos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Descubra destinos com os menores preços em nosso histórico de{" "}
          <span className="font-bold text-foreground">1.5 milhão</span> de tarifas.
        </p>
        <button className="mt-4 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98]">
          explorar todos
        </button>
      </div>

      {/* Destination cards */}
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {destinations.map((dest) => (
          <div
            key={dest.name}
            className="shrink-0 w-40 overflow-hidden rounded-2xl bg-card card-miles"
          >
            <div className="relative h-28 overflow-hidden">
              <img
                src={dest.image}
                alt={dest.name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
              <span className="absolute bottom-2 left-3 font-display text-sm font-bold text-primary-foreground">
                {dest.name}
              </span>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-xs font-semibold text-foreground">{dest.miles} milhas</p>
              <p className="text-xs text-muted-foreground">a partir de R$ {dest.price}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExploreDestinations;

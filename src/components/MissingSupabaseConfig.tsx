const MissingSupabaseConfig = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 py-12 text-center text-slate-100">
    <h1 className="text-xl font-semibold text-white">Gest Miles indisponível</h1>
    <p className="max-w-md text-sm text-slate-300">
      Não foi possível carregar o app agora. Tente novamente em alguns minutos.
    </p>
  </div>
);

export default MissingSupabaseConfig;

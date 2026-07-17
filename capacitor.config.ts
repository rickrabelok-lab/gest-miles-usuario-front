import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.gestmiles.app',
  appName: 'Gest Miles',
  webDir: 'dist',
  // Default do Capacitor. Explícito pra travar a intenção: logs da bridge
  // (incl. a URL do deep link em appUrlOpen) só saem em builds DEBUG; o build
  // de release/loja fica silencioso. Não trocar pra 'production'.
  loggingBehavior: 'debug',
  plugins: {
    SplashScreen: {
      // O script da abertura (index.html) esconde quando o 1º frame da
      // Constelação estiver pintado — sem flash entre splash e abertura.
      launchAutoHide: false,
    },
  },
};

export default config;

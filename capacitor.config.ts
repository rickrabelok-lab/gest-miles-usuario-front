import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.gestmiles.app',
  appName: 'Gest Miles',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // O script da abertura (index.html) esconde quando o 1º frame da
      // Constelação estiver pintado — sem flash entre splash e abertura.
      launchAutoHide: false,
    },
  },
};

export default config;

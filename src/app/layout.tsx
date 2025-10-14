import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';

import { TRPCReactProvider } from "~/trpc/react";
import { Providers } from "~/app/_components/providers/session-provider";

export const metadata: Metadata = {
  title: "Presupuesto Semanal",
  description: "Aplicación de presupuesto semanal con seguimiento por categorías",
  icons: [
    // El formato .ico para la máxima compatibilidad (muchos navegadores lo buscan por defecto)
    { rel: "icon", url: "/favicon/favicon.ico" },
    
    // PNGs para navegadores modernos (Chrome, Firefox, etc.)
    { rel: "icon", type: "image/png", sizes: "16x16", url: "/favicon/favicon-16x16.png" },
    { rel: "icon", type: "image/png", sizes: "32x32", url: "/favicon/favicon-32x32.png" },

    // Ícono para dispositivos Apple (añadir a la pantalla de inicio)
    { rel: "apple-touch-icon", type: "image/png", sizes: "180x180", url: "/favicon/apple-touch-icon.png" },

    // Íconos de alta resolución para Android y PWA (Progressive Web App)
    { rel: "icon", type: "image/png", sizes: "192x192", url: "/favicon/android-chrome-192x192.png" },
    { rel: "icon", type: "image/png", sizes: "512x512", url: "/favicon/android-chrome-512x512.png" },
  ],
  
  // Enlazar al manifiesto web (necesario para el ícono y la experiencia PWA en Android/Chrome)
  manifest: "/favicon/site.webmanifest",
};

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: GeistSans.style.fontFamily,
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${GeistSans.variable}`}>
      <body>
        <MantineProvider theme={theme}>
          <Notifications />
          <TRPCReactProvider>
            <Providers>{children}</Providers>
          </TRPCReactProvider>
        </MantineProvider>
      </body>
    </html>
  );
}

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
  icons: [{ rel: "icon", url: "/favicon.ico" }],
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

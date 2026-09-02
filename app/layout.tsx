import type { Metadata } from "next";
import { VisualAtmosphere } from "@/components/VisualAtmosphere";
import "./globals.css";

export const metadata: Metadata = {
  title: "Andhrím — Agent or Not?",
  description: "Local, owner-controlled work delegation assessment prototype.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <VisualAtmosphere />
        {children}
      </body>
    </html>
  );
}

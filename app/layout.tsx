import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = { title: "Stockpilot · Retail replenishment", description: "A transparent inventory replenishment agent for Nigerian retailers." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

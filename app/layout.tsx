import type { Metadata, Viewport } from "next";
import { Poppins, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/context/WalletContext";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";
import { AgreementProvider } from "@/context/AgreementContext";
import { MilestoneProvider } from "@/context/MilestoneContext";
import { ObservabilityInit } from "@/components/observability/ObservabilityInit";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { NetworkGuardBanner } from "@/components/wallet/NetworkGuardBanner";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://belay.app")
  ),
  title: {
    default: "Belay — Milestone Escrow on the Stellar Blockchain",
    template: "%s | Belay",
  },
  description:
    "Belay is decentralized milestone escrow for freelance work, built on the Stellar blockchain. Fund milestones, approve deliverables, and release payment on-chain — trustless escrow, transparent settlement.",
  keywords: [
    "Stellar",
    "blockchain",
    "freelance escrow",
    "milestone payments",
    "smart contract",
    "Soroban",
    "XLM",
    "Freighter wallet",
    "decentralized",
    "web3",
  ],
  authors: [{ name: "Belay Team" }],
  creator: "Belay",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://belay.app",
    siteName: "Belay",
    title: "Belay — Milestone Escrow on the Stellar Blockchain",
    description:
      "Decentralized milestone escrow powered by Stellar. Fund, approve, and release — transparently.",
    // Social image is provided by app/opengraph-image.tsx (file convention).
  },
  twitter: {
    card: "summary_large_image",
    title: "Belay — Milestone Escrow on the Stellar Blockchain",
    description: "Decentralized milestone escrow powered by Stellar.",
    // Image provided by app/twitter-image.tsx (file convention).
  },
  // Icons are provided by app/icon.svg + app/apple-icon.tsx (file conventions).
  applicationName: "Belay",
  appleWebApp: {
    capable: true,
    title: "Belay",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#F6F6F6",
  width: "device-width",
  initialScale: 1,
  // Extend under the iOS notch / home indicator so safe-area insets work in the
  // installed PWA.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`scroll-smooth ${poppins.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-paper text-ink font-sans antialiased">
        {/* First in the tree: attaches error reporting before any provider
            below it can throw. Renders nothing. */}
        <ObservabilityInit />
        <ToastProvider>
          <WalletProvider>
            <NetworkGuardBanner />
            <AuthProvider>
              {/* Both agreement and milestone stores read the connected wallet,
                  so they nest inside WalletProvider. The milestone store must
                  also sit inside the agreement store so detail pages can read
                  an agreement and its milestones from one tree. */}
              <AgreementProvider>
                <MilestoneProvider>
                  {children}
                  <InstallPrompt />
                </MilestoneProvider>
              </AgreementProvider>
            </AuthProvider>
          </WalletProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

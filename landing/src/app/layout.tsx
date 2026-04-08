import "./globals.css";

export const metadata = {
  title: "Flexipay",
  description:
    "Flexipay is an embeddable BNPL widget for marketplaces. Drop in a script tag, let buyers pay 50% now and 50% in 30 days, and let the AI recovery agent handle failed installments automatically.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

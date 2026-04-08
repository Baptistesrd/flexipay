import "./globals.css";

export const metadata = {
  title: "Flexipay",
  description:
    "Flexipay adds two-part payment to your checkout in just a few minutes. Integrated widget, direct debit, merchant reporting.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

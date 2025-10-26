export const metadata = {
  title: "Checkout Analyzer",
  description: "Scan a site for checkout-related code",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'Inter, system-ui, Arial, sans-serif', background: '#0b1020', color: '#e6e9ef', margin: 0 }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px' }}>
          {children}
        </div>
      </body>
    </html>
  );
}

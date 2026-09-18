import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GridWise LLM — Team Metavis | BUP CSE Fest 2026",
  description: "LLM-assisted 24-hour campus energy scheduling service and linear programming optimizer for BUP CSE Fest 2026 Hackathon.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>" />
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: "#0b0f19", color: "#e2e8f0", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}

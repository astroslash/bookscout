import type { ReactNode } from "react";

export const metadata = {
  title: "K4 Connect",
  description: "A reusable connector factory for useful conversations.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

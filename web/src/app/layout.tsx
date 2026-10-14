import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EchoLoom',
  description: 'Share work and ideas with communities on EchoLoom.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

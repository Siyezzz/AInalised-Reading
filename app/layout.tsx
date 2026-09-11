import type { Metadata } from 'next';
import './globals.css';
import './extra.css';
import AiSetup from './ai-setup';

export const metadata: Metadata = {
  metadataBase: new URL('https://zhiji-reading.li-siye-0123.chatgpt.site'),
  title: '知己读书｜按你的方式读名著',
  description:
    '根据你的兴趣、能力和弱点，持续进化讲法、题目与阅读路径的名著伴读平台。',
  openGraph: {
    title: '知己读书｜按你的方式读名著',
    description: '讲法、题目和阅读路径，会随着你一起进化。',
    images: [
      {
        url: '/og.png',
        width: 1732,
        height: 907,
        alt: '知己读书——按你的方式读名著',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '知己读书｜按你的方式读名著',
    description: '讲法、题目和阅读路径，会随着你一起进化。',
    images: ['/og.png'],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <AiSetup />
      </body>
    </html>
  );
}

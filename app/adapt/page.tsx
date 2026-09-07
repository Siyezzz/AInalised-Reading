import { Search } from 'lucide-react';
import BrandMark from '../brand-mark';
import AdaptReader from './reader';

export default function AdaptPage() {
  return <main className="product-shell chapter-page"><header className="main-nav"><a href="/" className="brand"><span><BrandMark size={21} /></span>知己读书</a><nav><a href="/">首页</a><a href="/library">书库</a><a href="/shelf">我的书架</a><a href="/profile">阅读画像</a></nav><a className="nav-search" href="/discover"><Search size={18} /><span>搜索</span></a></header><AdaptReader /></main>;
}

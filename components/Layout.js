import Sidebar from './Sidebar';
import Head from 'next/head';

export default function Layout({ children }) {
  return (
    <div className="flex h-screen bg-gray-100">
      <Head>
        <title>Entrerrios Dental - Panel</title>
      </Head>
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
import Image from 'next/image';
import Link from 'next/link';

export default function Sidebar() {
  return (
    <div className="w-64 bg-white shadow-md">
      <div className="p-4 border-b">
        <Image 
          src="/logo.png" 
          alt="Logo Entrerrios Dental" 
          width={150} 
          height={50} 
        />
      </div>
      <nav className="p-4">
        <ul className="space-y-2">
          <li>
            <Link href="/" className="block p-2 hover:bg-gray-100 rounded">
              Inicio
            </Link>
          </li>
          <li>
            <Link href="/movimientos/subir" className="block p-2 hover:bg-gray-100 rounded font-semibold">
              Subir Movimientos
            </Link>
          </li>
          <li>
            <Link href="/movimientos/revision-gastos" className="block p-2 hover:bg-gray-100 rounded font-semibold">
              Revisar Movimientos
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
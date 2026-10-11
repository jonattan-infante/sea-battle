import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 via-blue-700 to-blue-500 flex flex-col items-center justify-center px-4 py-8">
      <div className="max-w-4xl mx-auto text-center">
        {/* Imagen de referencia */}
        <div className="mb-8">
          <Image
            src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
            alt="Batallas de barcos piratas en el mar"
            width={800}
            height={400}
            className="rounded-lg shadow-2xl mx-auto"
            priority
          />
        </div>

        {/* Título del juego */}
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg">
          Sea Battle
        </h1>

        {/* Descripción breve */}
        <p className="text-lg md:text-xl text-blue-100 mb-8 max-w-2xl mx-auto leading-relaxed">
          Embárcate en una épica aventura naval y enfrenta a temibles barcos piratas en intensas batallas.
          ¡Demuestra tu valentía y conviértete en el rey de los mares!
        </p>

        {/* Botón para acceder al juego */}
        <Link href="/game">
          <button className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-8 rounded-full text-lg md:text-xl transition duration-300 transform hover:scale-105 shadow-lg">
            Jugar Ahora
          </button>
        </Link>
      </div>
    </div>
  );
}

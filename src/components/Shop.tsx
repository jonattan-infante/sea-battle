import React from 'react';
import useGameStore from '../stores/gameStore';
import { EquipmentType, UPGRADE_COSTS } from '../types/game';

const Shop: React.FC = () => {
  const { gold, cannonLevel, sailLevel, upgradeCannon, upgradeSail, getCannonDamage, getSailSpeed, getMaxAmmo, repairShip } = useGameStore();

  const cannonCost = cannonLevel < 5 ? UPGRADE_COSTS[EquipmentType.Cannon][cannonLevel - 1] : 0;
  const sailCost = sailLevel < 5 ? UPGRADE_COSTS[EquipmentType.Sail][sailLevel - 1] : 0;

  return (
    <div className="bg-gray-800 text-white p-6 rounded-lg shadow-lg max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-center">Tienda de Mejoras</h2>
      <div className="mb-4 text-center">
        <span className="text-yellow-400 font-semibold">Oro disponible: {gold}</span>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Caño</h3>
        <div className="bg-gray-700 p-3 rounded mb-2">
          <p>Nivel: {cannonLevel}/5</p>
          <p>Daño por bala: {getCannonDamage()}</p>
          <p>Munición máxima: {getMaxAmmo()}</p>
        </div>
        {cannonLevel < 5 ? (
          <button
            onClick={() => upgradeCannon()}
            disabled={gold < cannonCost}
            className={`w-full py-2 px-4 rounded font-semibold ${
              gold >= cannonCost
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            Mejorar a nivel {cannonLevel + 1} ({cannonCost} oro)
          </button>
        ) : (
          <p className="text-green-400 text-center">Máximo nivel alcanzado</p>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-2">Velas</h3>
        <div className="bg-gray-700 p-3 rounded mb-2">
          <p>Nivel: {sailLevel}/5</p>
          <p>Velocidad de navegación: {getSailSpeed()}</p>
        </div>
        {sailLevel < 5 ? (
          <button
            onClick={() => upgradeSail()}
            disabled={gold < sailCost}
            className={`w-full py-2 px-4 rounded font-semibold ${
              gold >= sailCost
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            Mejorar a nivel {sailLevel + 1} ({sailCost} oro)
          </button>
        ) : (
          <p className="text-green-400 text-center">Máximo nivel alcanzado</p>
        )}
      </div>
    </div>
  );
};

export default Shop;
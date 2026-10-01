import { createContext } from "react";

/**
 * Las dos ranuras de la barra superior: una antes del título y otra antes del
 * avatar. Cada pantalla puede colgar ahí sus acciones (por un portal) en vez de
 * dibujarlas adentro del contenido.
 *
 * Es lo que hace cualquier chat de IA: el menú de conversaciones a la izquierda
 * y "nueva conversación" a la derecha, en una barra que no se va con el scroll.
 * Dibujadas en el cuerpo de la pantalla, se escondían apenas la charla se hacía
 * larga, justo cuando más se las necesita.
 *
 * Los valores son los elementos DOM de las ranuras (o null antes de montarse).
 */
export const TopbarContext = createContext({ izquierda: null, derecha: null });

import { useContext } from "react";
import { LugaresContext } from "../context/LugaresContext";

export const useLugares = () => {
  const context = useContext(LugaresContext);

  if (!context) {
    throw new Error("useLugares debe usarse dentro de LugaresProvider");
  }

  return context;
};

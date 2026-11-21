import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// Los findBy*/waitFor esperan 1s por defecto: bajo carga (suite completa o CI) no alcanza para pantallas
// pesadas y el test falla por tiempo, no por lógica. 4s deja margen sin esconder un fallo real.
configure({ asyncUtilTimeout: 4000 });

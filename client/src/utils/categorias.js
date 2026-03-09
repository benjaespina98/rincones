export const categorias = [
  { value: "rio", label: "Río" },
  { value: "montana", label: "Montaña" },
  { value: "bar", label: "Bar" },
  { value: "cafeteria", label: "Cafetería" },
  { value: "restaurante", label: "Restaurante" },
  { value: "mirador", label: "Mirador" },
  { value: "turistico", label: "Turístico" },
];

const normalizeCategoria = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const categoriasMap = Object.fromEntries(categorias.map((item) => [item.value, item.label]));

export const formatearCategoria = (categoria) => {
  const key = normalizeCategoria(categoria);
  return categoriasMap[key] || categoria;
};

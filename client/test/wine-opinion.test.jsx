import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

/**
 * Puntuar un vino.
 *
 * ── EL REPORTE ──────────────────────────────────────────────────────────────
 * "Si sólo pongo las estrellas no me deja publicar, sí o sí tengo que entrar a
 * comentar y ahí publicar."
 *
 * Y publicaba: tocar una estrella siempre llamó a `publishWineReview`, y el
 * servidor acepta reseñas sin texto. Lo que faltaba era DECIRLO. Puntuar
 * guardaba en silencio mientras que el camino largo —escribir la reseña y tocar
 * "Publicar"— terminaba en un toast. Dos acciones que hacen lo mismo, una muda y
 * otra que avisa: cualquiera concluye que hay que pasar por la que avisa.
 *
 * Estas pruebas fijan que puntuar sea suficiente Y que se note.
 */

const publishWineReview = vi.fn();
const deleteWineReview = vi.fn();
const getWineReviews = vi.fn();
const showSuccess = vi.fn();
const showError = vi.fn();

vi.mock("../src/services/reviewApi", () => ({
  getWineReviews: (...a) => getWineReviews(...a),
  publishWineReview: (...a) => publishWineReview(...a),
  deleteWineReview: (...a) => deleteWineReview(...a),
}));

vi.mock("../src/context/ToastContext", () => ({
  useToast: () => ({ showSuccess, showError, addToast: vi.fn(), removeToast: vi.fn() }),
}));

const WineOpinion = (await import("../src/components/WineOpinion")).default;

const vino = { name: "Saint Felicien", winery: "Catena Zapata", varietal: "Cabernet Franc" };

beforeEach(() => {
  vi.clearAllMocks();
  getWineReviews.mockResolvedValue({ mine: null });
});

afterEach(cleanup);

describe("puntuar sin escribir nada", () => {
  it("tocar una estrella publica, sin pasar por el formulario de reseña", async () => {
    publishWineReview.mockResolvedValue({ rating: 4, text: "" });
    render(<WineOpinion {...vino} />);

    fireEvent.click(screen.getByRole("button", { name: "4 estrellas" }));

    await waitFor(() => expect(publishWineReview).toHaveBeenCalledTimes(1));
    // Se publica con el texto vacío: la puntuación sola es una opinión completa.
    expect(publishWineReview.mock.calls[0][0]).toMatchObject({ rating: 4, text: "" });
  });

  it("lo confirma: era lo único que faltaba para que no pareciera roto", async () => {
    publishWineReview.mockResolvedValue({ rating: 5, text: "" });
    render(<WineOpinion {...vino} />);

    fireEvent.click(screen.getByRole("button", { name: "5 estrellas" }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    // El acuse nombra la escala, así confirma que se publicó y QUÉ se publicó.
    expect(showSuccess.mock.calls[0][0]).toMatch(/publicaste/i);
    expect(showSuccess.mock.calls[0][0]).toMatch(/de los que se recuerdan/i);
  });

  it("y deja la confirmación en pantalla, no sólo en un toast que se va", async () => {
    publishWineReview.mockResolvedValue({ rating: 3, text: "" });
    render(<WineOpinion {...vino} />);

    fireEvent.click(screen.getByRole("button", { name: "3 estrellas" }));

    // La duda "¿quedó publicado?" aparece un rato después, cuando el toast ya no
    // está: la respuesta tiene que seguir visible.
    await waitFor(() => expect(screen.getByText("Publicada")).toBeTruthy());
  });

  it("escribir la reseña se ofrece recién con la puntuación ya publicada", async () => {
    // El botón decía "Contá a qué te supo (opcional)": la aclaración estaba ahí
    // porque sin ella se leía como el paso que faltaba para que la puntuación
    // contara. Quien lo resuelve ahora es la confirmación de al lado
    // ("Publicada"), que dice que lo importante YA pasó — así el botón puede
    // llamarse por lo que hace y no cargar la aclaración encima.
    publishWineReview.mockResolvedValue({ rating: 4, text: "" });
    render(<WineOpinion {...vino} />);

    fireEvent.click(screen.getByRole("button", { name: "4 estrellas" }));

    await waitFor(() => expect(screen.getByText("Publicada")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Escribir una reseña/i })).toBeTruthy();
  });

  it("la carga inicial no pisa la estrella que ya tocaste", async () => {
    // El peor caso del problema reportado, y era real: si la respuesta de la
    // carga inicial llega DESPUÉS del toque, escribía el rating viejo (0) encima
    // del nuevo. La reseña quedaba publicada en el servidor y la pantalla
    // mostraba cero estrellas — puntuabas, se guardaba, y la app te decía que no.
    let resolverCarga;
    getWineReviews.mockReturnValue(new Promise((r) => { resolverCarga = r; }));
    publishWineReview.mockResolvedValue({ rating: 4, text: "" });

    render(<WineOpinion {...vino} />);

    // La persona puntúa antes de que llegue la carga.
    fireEvent.click(screen.getByRole("button", { name: "4 estrellas" }));
    await waitFor(() => expect(publishWineReview).toHaveBeenCalled());

    // Y recién ahí contesta el servidor, diciendo que no había reseña.
    resolverCarga({ mine: null });

    // La puntuación tiene que seguir en pie.
    await waitFor(() => expect(screen.getByText("Muy bueno")).toBeTruthy());
  });

  it("si el guardado falla, la estrella vuelve a lo que de verdad hay publicado", async () => {
    getWineReviews.mockResolvedValue({ mine: { rating: 2, text: "" } });
    publishWineReview.mockRejectedValue(new Error("sin red"));
    render(<WineOpinion {...vino} />);

    await waitFor(() => expect(screen.getByText("Flojo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "5 estrellas" }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    // No puede quedar mostrando 5 sobre una reseña que sigue siendo de 2.
    await waitFor(() => expect(screen.getByText("Flojo")).toBeTruthy());
  });
});

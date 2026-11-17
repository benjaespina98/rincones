import Icon from "./Icon";
import { musicaDelVino, playlistUrl, youtubeUrl } from "../data/playlists";
import "../styles/shared/WineMusic.css";

/**
 * «Para acompañar»: una frase y una playlist, a la vista en la ficha del vino.
 *
 * La música vivía adentro de un plan que había que elegir primero (y que muy poca gente encontraba), y en Descubrí
 * como dos links sueltos sin vino. Acá es parte de la ficha: entrás a un vino y, justo debajo de cómo es, hay una frase
 * y una playlist para tomarlo. Si elegís un plan más abajo, la música lo sigue (la frase y la lista cambian solas).
 *
 * Es un link a Spotify (abre la app si está instalada) y, aparte y más discreto, la misma búsqueda en YouTube. No
 * reproduce nada adentro: ni se conecta una cuenta ni se carga un reproductor de un tercero en cada ficha.
 */
export default function WineMusic({ wine, info, plan = null }) {
  const { playlist, frase } = musicaDelVino(wine?.type, info?.structure, plan);

  return (
    <section className="wine-music" aria-label="Para acompañar">
      <p className="wine-music__frase" aria-live="polite">{frase}</p>
      <div className="wine-music__acciones">
        <a className="wine-music__lista" href={playlistUrl(playlist)} target="_blank" rel="noopener noreferrer" aria-label={`${playlist.name}, en Spotify (se abre en otra ventana)`}>
          <span className="wine-music__icono" aria-hidden="true">
            <Icon name="music" size={16} />
          </span>
          <span className="wine-music__texto">
            <strong>{playlist.name}</strong>
            <em>{playlist.mood}</em>
          </span>
          <span className="wine-music__ir">Spotify</span>
        </a>
        <a className="wine-music__yt" href={youtubeUrl(playlist)} target="_blank" rel="noopener noreferrer" aria-label={`Buscar ${playlist.name} en YouTube (se abre en otra ventana)`}>
          Ver en YouTube
        </a>
      </div>
    </section>
  );
}

import { useState, useEffect } from 'react';
import { getWineImage } from '../services/imageService';

/**
 * Hook que enriquece una lista de vinos con imágenes precargadas
 * Usa imageService para fallback a Unsplash si es necesario
 */
export const useWineWithImages = (wines) => {
  const [winesWithImages, setWinesWithImages] = useState(wines);

  useEffect(() => {
    if (!wines || wines.length === 0) {
      setWinesWithImages(wines);
      return;
    }

    const enrichWines = async () => {
      try {
        const enriched = await Promise.all(
          wines.map(async (wine) => {
            const imageUrl = await getWineImage(wine);
            return {
              ...wine,
              image: imageUrl,
            };
          })
        );
        setWinesWithImages(enriched);
      } catch (err) {
        console.error('Error enriching wines with images:', err);
        setWinesWithImages(wines);
      }
    };

    enrichWines();
  }, [wines]);

  return winesWithImages;
};

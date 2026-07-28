// Catálogo de vinos argentinos, escrito a mano.
//
// ── DE DÓNDE SALEN ESTOS DATOS ──────────────────────────────────────────────
// La primera carga la hizo Claude desde su conocimiento del mercado argentino,
// sin contrastar contra ninguna fuente. Se está verificando bodega por bodega
// contra los sitios OFICIALES; las que ya pasaron por eso están marcadas abajo
// con "verificado". El resto sigue sin confirmar y puede tener errores: una
// línea discontinuada, una región mal atribuida, un varietal que esa bodega no
// produce.
//
// CÓMO VERIFICAR UNA BODEGA (el método que funciona):
// Las webs de bodega son SPAs y bajar el HTML crudo no sirve — llega el
// esqueleto sin contenido. Hay que renderizarlas. Con el navegador abierto en
// la home de la bodega:
//
//   1. Sacar las URLs de cada línea:
//        [...document.querySelectorAll("a")].map(a => a.href)
//   2. Traerlas todas de una y quedarse con lo que nombre un varietal:
//        for (const u of urls) {
//          const html = await (await fetch(u)).text();
//          const doc = new DOMParser().parseFromString(html, "text/html");
//          ...
//        }
//
// Sale el catálogo completo de la bodega en una sola pasada. Si el sitio nombra
// la línea pero NO el varietal, la fila NO se carga: completarla de memoria es
// exactamente el problema que esta verificación viene a resolver.
//
// Lo que encontró la primera verificación (Catena Zapata) da una idea del error
// esperable: de 14 filas, 1 estaba MAL (Nicolás Catena Zapata figuraba como
// Cabernet Sauvignon y es un blend) y faltaban 15 líneas que la bodega sí
// produce. O sea: más incompleto que incorrecto, pero con errores reales.
//
// Entonces, ¿por qué manda por sobre lo que devuelve el modelo? No porque esté
// mejor verificado —el origen es parecido—, sino porque acá está CONGELADO y es
// AUDITABLE: siempre devuelve lo mismo, se puede leer entero, corregir y
// revisar en el historial de git. Lo que genera el modelo en vivo cambia entre
// llamadas y nadie lo mira antes de mostrarlo.
//
// Es además la fuente PRIMARIA por una razón práctica: Open Food Facts tiene muy
// poca cobertura de vino argentino y sus nombres vienen sucios, así que apoyarse
// sólo en él hacía que búsquedas obvias ("Catena Malbec") no devolvieran nada.
//
// El nombre visible se arma como "<línea> <varietal>", que es como se busca.

const RAW = [
  // --- Catena Zapata --- (verificado contra catenazapata.com, jul 2026)
  ["Catena Zapata", "Catena", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Catena", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Catena", "Chardonnay", "Luján de Cuyo, Mendoza", "white"],
  ["Catena Zapata", "Catena Alta", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Catena Alta", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Catena Alta", "Chardonnay", "Luján de Cuyo, Mendoza", "white"],
  ["Catena Zapata", "Nicolás Catena Zapata", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Adrianna Vineyard White Stones", "Chardonnay", "Gualtallary, Mendoza", "white"],
  ["Catena Zapata", "Angélica Zapata", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Angélica Zapata", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Angélica Zapata", "Cabernet Franc", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Angélica Zapata", "Merlot", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Angélica Zapata", "Chardonnay", "Luján de Cuyo, Mendoza", "white"],
  ["Catena Zapata", "Saint Felicien", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Saint Felicien", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Saint Felicien", "Cabernet Franc", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Saint Felicien", "Bonarda", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Saint Felicien", "Sangiovese", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Saint Felicien", "Syrah", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "Saint Felicien", "Chardonnay", "Luján de Cuyo, Mendoza", "white"],
  ["Catena Zapata", "Saint Felicien", "Sauvignon Blanc", "Luján de Cuyo, Mendoza", "white"],
  ["Catena Zapata", "DV Catena", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "DV Catena", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "DV Catena", "Syrah", "Luján de Cuyo, Mendoza", "red"],
  ["Catena Zapata", "DV Catena", "Chardonnay", "Luján de Cuyo, Mendoza", "white"],
  ["Catena Zapata", "Alamos", "Malbec", "Mendoza", "red"],
  ["Catena Zapata", "Alamos", "Torrontés", "Cafayate, Salta", "white"],

  // --- Rutini Wines --- (verificado contra rutiniwines.com, jul 2026)
  ["Rutini Wines", "Apartado", "Gran Chardonnay", "Valle de Uco, Mendoza", "white"],
  ["Rutini Wines", "Apartado", "Gran Blend", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Apartado", "Gran Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Rutini Single Vineyard", "Chardonnay", "Gualtallary, Mendoza", "white"],
  ["Rutini Wines", "Rutini Single Vineyard", "Cabernet Sauvignon", "Gualtallary, Mendoza", "red"],
  ["Rutini Wines", "Rutini Single Vineyard", "Malbec", "Gualtallary, Mendoza", "red"],
  ["Rutini Wines", "Rutini Single Vineyard", "Merlot", "Gualtallary, Mendoza", "red"],
  ["Rutini Wines", "Rutini Single Vineyard", "Cabernet Franc", "Gualtallary, Mendoza", "red"],
  ["Rutini Wines", "Rutini Blend of Terroirs", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Rutini Blend of Terroirs", "Blend de Blancs", "Valle de Uco, Mendoza", "white"],
  ["Rutini Wines", "Rutini Blend of Terroirs", "Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Rutini Colección", "Rosé", "Tupungato, Mendoza", "rosé"],
  ["Rutini Wines", "Rutini Colección", "Syrah", "Tupungato, Mendoza", "red"],
  ["Rutini Wines", "Rutini Colección", "Chardonnay", "Tupungato, Mendoza", "white"],
  ["Rutini Wines", "Rutini Colección", "Sauvignon Blanc", "Tupungato, Mendoza", "white"],
  ["Rutini Wines", "Rutini Colección", "Brut Nature", "Tupungato, Mendoza", "sparkling"],
  ["Rutini Wines", "Rutini Colección", "Cabernet Franc", "Tupungato, Mendoza", "red"],
  ["Rutini Wines", "Rutini Colección", "Cabernet Malbec", "Tupungato, Mendoza", "red"],
  ["Rutini Wines", "Rutini Colección", "Cabernet Merlot", "Tupungato, Mendoza", "red"],
  ["Rutini Wines", "Rutini Colección", "Cabernet Sauvignon", "Tupungato, Mendoza", "red"],
  ["Rutini Wines", "Rutini Colección", "Cabernet Syrah", "Tupungato, Mendoza", "red"],
  ["Rutini Wines", "Rutini Finca Centenaria", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Dominio", "Gran Malbec", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Dominio", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Dominio", "Brut Nature", "Valle de Uco, Mendoza", "sparkling"],
  ["Rutini Wines", "Dominio", "Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Dominio", "Chardonnay", "Valle de Uco, Mendoza", "white"],
  ["Rutini Wines", "Dominio", "Extra Brut", "Valle de Uco, Mendoza", "sparkling"],
  ["Rutini Wines", "Dominio", "Gran Blend", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Dominio", "Gran Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Encuentro", "Chardonnay", "Valle de Uco, Mendoza", "white"],
  ["Rutini Wines", "Encuentro", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Encuentro", "Barrel Blend", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Encuentro", "Brut Nature", "Valle de Uco, Mendoza", "sparkling"],
  ["Rutini Wines", "Encuentro", "Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter Reserve", "Rosé", "Valle de Uco, Mendoza", "rosé"],
  ["Rutini Wines", "Trumpeter Reserve", "Torrontés", "Valle de Uco, Mendoza", "white"],
  ["Rutini Wines", "Trumpeter Reserve", "Blend", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter Reserve", "Bonarda", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter Reserve", "Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter Reserve", "Chardonnay", "Valle de Uco, Mendoza", "white"],
  ["Rutini Wines", "Trumpeter Reserve", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter Reserve", "Petit Verdot", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter Reserve", "Pinot Noir", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter", "Merlot", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter", "Sauvignon Blanc", "Valle de Uco, Mendoza", "white"],
  ["Rutini Wines", "Trumpeter", "Syrah", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter", "Brut Nature", "Valle de Uco, Mendoza", "sparkling"],
  ["Rutini Wines", "Trumpeter", "Cabernet Franc", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter", "Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Rutini Wines", "Trumpeter", "Chardonnay", "Valle de Uco, Mendoza", "white"],
  ["Rutini Wines", "Trumpeter", "Torrontés", "Valle de Uco, Mendoza", "white"],
  ["Rutini Wines", "Antología", "Blend", "Valle de Uco, Mendoza", "red"],

  // --- Luigi Bosca --- (verificado contra luigibosca.com, jul 2026)
  ["Luigi Bosca", "Luigi Bosca Insignia", "Chardonnay", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "Luigi Bosca Insignia", "Sauvignon Blanc", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "Luigi Bosca Insignia", "Pinot Noir", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca Insignia", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca Insignia", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca Insignia", "Rosé", "Luján de Cuyo, Mendoza", "rosé"],
  ["Luigi Bosca", "Luigi Bosca Insignia", "Gewürztraminer", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "Luigi Bosca Insignia", "Riesling", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "Luigi Bosca De Sangre", "Chardonnay", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "Luigi Bosca De Sangre", "White Blend", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "Luigi Bosca De Sangre", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca De Sangre", "Cabernet Franc", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca De Sangre", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca De Sangre", "Corte", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca Apuntes", "Semillón", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "Luigi Bosca Apuntes", "Naranjo", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "Luigi Bosca Apuntes", "Malbec Orgánico", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca Apuntes", "Grenache", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca Legado", "León", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca Legado", "Filos Chardonnay", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "Luigi Bosca Legado", "Paraíso", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca Legado", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Finca Los Nobles", "Cabernet Bouchet", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Gala 1", "Malbec Petit Verdot", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "Gala 3", "Blend Blanco", "Luján de Cuyo, Mendoza", "white"],
  ["Luigi Bosca", "La Linda", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Luigi Bosca", "La Linda", "Torrontés", "Luján de Cuyo, Mendoza", "white"],

  // --- Trapiche ---
  ["Trapiche", "Trapiche Medalla", "Cabernet Sauvignon", "Maipú, Mendoza", "red"],
  ["Trapiche", "Trapiche Broquel", "Malbec", "Maipú, Mendoza", "red"],
  ["Trapiche", "Trapiche Broquel", "Bonarda", "Maipú, Mendoza", "red"],
  ["Trapiche", "Trapiche Oak Cask", "Malbec", "Maipú, Mendoza", "red"],
  ["Trapiche", "Trapiche Iscay", "Blend", "Maipú, Mendoza", "red"],
  ["Trapiche", "Trapiche Costa & Pampa", "Chardonnay", "Chapadmalal, Buenos Aires", "white"],
  ["Trapiche", "Fond de Cave", "Malbec", "Maipú, Mendoza", "red"],

  // --- Norton ---
  ["Norton", "Norton Reserva", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Norton", "Norton Reserva", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Norton", "Norton Barrel Select", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Norton", "Norton Privada", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Norton", "Norton Cosecha Especial", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Norton", "Norton", "Extra Brut", "Luján de Cuyo, Mendoza", "sparkling"],

  // --- Zuccardi / Familia Zuccardi ---
  ["Familia Zuccardi", "Zuccardi Serie A", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Zuccardi Serie A", "Torrontés", "Valle de Uco, Mendoza", "white"],
  ["Familia Zuccardi", "Zuccardi Q", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Zuccardi Q", "Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Zuccardi Aluvional", "Malbec", "Gualtallary, Mendoza", "red"],
  ["Familia Zuccardi", "Zuccardi Concreto", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Tito Zuccardi", "Blend", "Paraje Altamira, Mendoza", "red"],
  ["Familia Zuccardi", "José Zuccardi", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Emma Zuccardi", "Bonarda", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Zuccardi Q", "Cabernet Franc", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Zuccardi Polígonos", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia", "Malbec", "Maipú, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia", "Torrontés", "Maipú, Mendoza", "white"],

  // --- Susana Balbo ---
  ["Susana Balbo Wines", "Susana Balbo Signature", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Susana Balbo Wines", "Susana Balbo Signature", "Torrontés", "Cafayate, Salta", "white"],
  ["Susana Balbo Wines", "Crios", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Susana Balbo Wines", "Crios", "Torrontés", "Cafayate, Salta", "white"],
  ["Susana Balbo Wines", "BenMarco", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Susana Balbo Wines", "Nosotros", "Malbec", "Valle de Uco, Mendoza", "red"],

  // --- El Enemigo / Aleanna ---
  ["El Enemigo", "El Enemigo", "Malbec", "Mendoza", "red"],
  ["El Enemigo", "El Enemigo", "Cabernet Franc", "Mendoza", "red"],
  ["El Enemigo", "El Enemigo", "Bonarda", "Mendoza", "red"],
  ["El Enemigo", "El Enemigo", "Chardonnay", "Mendoza", "white"],
  ["El Enemigo", "Gran Enemigo", "Cabernet Franc", "Gualtallary, Mendoza", "red"],

  // --- Achaval Ferrer ---
  ["Achaval Ferrer", "Achaval Ferrer", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Achaval Ferrer", "Finca Altamira", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Achaval Ferrer", "Finca Bella Vista", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Achaval Ferrer", "Quimera", "Blend", "Mendoza", "red"],

  // --- Salentein ---
  ["Bodegas Salentein", "Salentein Reserve", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Bodegas Salentein", "Salentein Reserve", "Pinot Noir", "Valle de Uco, Mendoza", "red"],
  ["Bodegas Salentein", "Salentein Numina", "Blend", "Valle de Uco, Mendoza", "red"],
  ["Bodegas Salentein", "Portillo", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Bodegas Salentein", "Portillo", "Sauvignon Blanc", "Valle de Uco, Mendoza", "white"],

  // --- Patagonia ---
  ["Bodega Chacra", "Chacra Treinta y Dos", "Pinot Noir", "Río Negro, Patagonia", "red"],
  ["Bodega Chacra", "Chacra Cincuenta y Cinco", "Pinot Noir", "Río Negro, Patagonia", "red"],
  ["Bodega Chacra", "Chacra Barda", "Pinot Noir", "Río Negro, Patagonia", "red"],
  ["Bodega Noemía", "Noemía", "Malbec", "Río Negro, Patagonia", "red"],
  ["Bodega Noemía", "J. Alberto", "Malbec", "Río Negro, Patagonia", "red"],
  ["Bodega Noemía", "A Lisa", "Malbec", "Río Negro, Patagonia", "red"],

  // --- Salta ---
  ["Bodega Colomé", "Colomé Estate", "Malbec", "Valle Calchaquí, Salta", "red"],
  ["Bodega Colomé", "Colomé Altura Máxima", "Malbec", "Valle Calchaquí, Salta", "red"],
  ["Bodega Colomé", "Colomé", "Torrontés", "Valle Calchaquí, Salta", "white"],
  ["El Esteco", "Don David", "Malbec", "Cafayate, Salta", "red"],
  ["El Esteco", "Don David", "Torrontés", "Cafayate, Salta", "white"],
  ["El Esteco", "Altimus", "Blend", "Cafayate, Salta", "red"],

  // --- Otras clásicas ---
  ["Terrazas de los Andes", "Terrazas Reserva", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Terrazas de los Andes", "Terrazas Grand", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Terrazas de los Andes", "Cheval des Andes", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Mendel Wines", "Mendel", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Mendel Wines", "Mendel Unus", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Mendel Wines", "Mendel Lunta", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Pulenta Estate", "Pulenta Estate", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Pulenta Estate", "Pulenta Estate", "Cabernet Franc", "Luján de Cuyo, Mendoza", "red"],
  ["Pulenta Estate", "Gran Corte", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Doña Paula", "Doña Paula Estate", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Doña Paula", "Doña Paula Los Cardos", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Doña Paula", "Doña Paula Selección de Bodega", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Alta Vista", "Alta Vista Premium", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Alta Vista", "Alta Vista Terroir Selection", "Malbec", "Mendoza", "red"],
  ["Bodega Lagarde", "Lagarde Guarda", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Bodega Lagarde", "Lagarde Altas Cumbres", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Vistalba", "Vistalba Corte A", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Vistalba", "Vistalba Corte B", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Vistalba", "Tomero", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Weinert", "Weinert Cavas de Weinert", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Weinert", "Weinert", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Trivento", "Trivento Golden Reserve", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Trivento", "Trivento Reserve", "Malbec", "Mendoza", "red"],
  ["Trivento", "Trivento White Malbec", "Malbec", "Mendoza", "white"],
  ["Finca Decero", "Decero Remolinos Vineyard", "Malbec", "Agrelo, Mendoza", "red"],
  ["Finca Decero", "Decero Amano", "Blend", "Agrelo, Mendoza", "red"],
  ["Bressia", "Bressia Profundo", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Bressia", "Bressia Monteagrelo", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Tapiz", "Tapiz Alta", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Tapiz", "Tapiz Black Tears", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Riglos", "Riglos Gran", "Malbec", "Gualtallary, Mendoza", "red"],
  ["Riglos", "Riglos Quinto", "Blend", "Gualtallary, Mendoza", "red"],
  ["La Posta", "La Posta Pizzella", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["La Posta", "La Posta Paulucci", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Escorihuela Gascón", "Escorihuela Gascón", "Malbec", "Maipú, Mendoza", "red"],
  ["Escorihuela Gascón", "Don Miguel Gascón", "Malbec", "Maipú, Mendoza", "red"],
  ["Nieto Senetiner", "Nieto Senetiner Reserva", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Nieto Senetiner", "Nieto Senetiner Reserva", "Bonarda", "Luján de Cuyo, Mendoza", "red"],
  ["Nieto Senetiner", "Don Nicanor", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Chandon", "Chandon", "Extra Brut", "Agrelo, Mendoza", "sparkling"],
  ["Chandon", "Chandon Délice", "Demi Sec", "Agrelo, Mendoza", "sparkling"],
  ["Chandon", "Baron B", "Extra Brut", "Agrelo, Mendoza", "sparkling"],
  ["Cruzat", "Cruzat Cuvée", "Extra Brut", "Valle de Uco, Mendoza", "sparkling"],
  ["Cruzat", "Cruzat Premier", "Extra Brut", "Valle de Uco, Mendoza", "sparkling"],
  ["Bodega Garzón", "Garzón Reserva", "Tannat", "Maldonado, Uruguay", "red"],
  ["Familia Schroeder", "Saurus", "Pinot Noir", "Neuquén, Patagonia", "red"],
  ["Familia Schroeder", "Familia Schroeder", "Malbec", "Neuquén, Patagonia", "red"],
  ["Humberto Canale", "Humberto Canale Estate", "Pinot Noir", "Río Negro, Patagonia", "red"],
  ["Humberto Canale", "Humberto Canale Old Vineyard", "Malbec", "Río Negro, Patagonia", "red"],

  // --- Líneas de todos los días / supermercado (lo que más se toma) ---
  ["Catena Zapata", "Alamos", "Cabernet Sauvignon", "Mendoza", "red"],
  ["Catena Zapata", "Alamos", "Chardonnay", "Mendoza", "white"],
  ["Trapiche", "Trapiche Vineyards", "Malbec", "Mendoza", "red"],
  ["Trapiche", "Trapiche Astica", "Malbec", "San Juan", "red"],
  ["Trapiche", "Trapiche Astica", "Cabernet Sauvignon", "San Juan", "red"],
  ["Trapiche", "Trapiche Roble", "Malbec", "Mendoza", "red"],
  ["Norton", "Norton Colección", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Norton", "Norton Lote Negro", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia", "Cabernet Sauvignon", "Maipú, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia Reserva", "Malbec", "Maipú, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia", "Pinot Grigio", "Maipú, Mendoza", "white"],
  ["Familia Zuccardi", "Santa Julia Tardío", "Torrontés", "Maipú, Mendoza", "white"],
  ["Bodega La Rural", "San Felipe", "Malbec", "Maipú, Mendoza", "red"],
  ["Bodega La Rural", "Rincón Famoso", "Malbec", "Mendoza", "red"],
  ["Fecovita", "Toro Viejo", "Tinto", "Mendoza", "red"],
  ["Fecovita", "Uvita", "Malbec", "Mendoza", "red"],
  ["Bodega Resero", "Resero", "Tinto", "Mendoza", "red"],
  ["Peñaflor", "Termidor", "Tinto", "Mendoza", "red"],
  ["Peñaflor", "Tres Cepas", "Tinto", "Mendoza", "red"],
  ["Bodegas Callia", "Callia Alta", "Malbec", "Valle de Tulum, San Juan", "red"],
  ["Bodegas Callia", "Callia Alta", "Syrah", "Valle de Tulum, San Juan", "red"],
  ["Bodegas Callia", "Callia", "Torrontés", "Valle de Tulum, San Juan", "white"],
  ["Finca Las Moras", "Las Moras", "Malbec", "San Juan", "red"],
  ["Finca Las Moras", "Las Moras", "Syrah", "San Juan", "red"],
  ["Finca Las Moras", "Las Moras Reserve", "Malbec", "San Juan", "red"],
  ["Finca Las Moras", "Las Moras Black Label", "Syrah", "San Juan", "red"],
  ["Michel Torino", "Cuma Orgánico", "Malbec", "Cafayate, Salta", "red"],
  ["Michel Torino", "Coleccion", "Torrontés", "Cafayate, Salta", "white"],
  ["Nanni", "Nanni Orgánico", "Torrontés", "Cafayate, Salta", "white"],

  // --- Valle de Uco / boutique buscadas ---
  ["Zuccardi Valle de Uco", "Zuccardi Fósil", "Chardonnay", "Gualtallary, Mendoza", "white"],
  ["Zuccardi Valle de Uco", "Zuccardi Finca Piedra Infinita", "Malbec", "Paraje Altamira, Mendoza", "red"],
  ["Bodega Teho", "Teho Zaha", "Malbec", "Altamira, Mendoza", "red"],
  ["Matías Riccitelli", "Riccitelli Hey Malbec", "Malbec", "Mendoza", "red"],
  ["Matías Riccitelli", "Riccitelli Old Vines", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Matías Riccitelli", "Riccitelli Vino de Finca", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Passionate Wine", "Gualtallary Via Revolucionario", "Malbec", "Gualtallary, Mendoza", "red"],
  ["Durigutti", "Durigutti Familia", "Malbec", "Las Compuertas, Mendoza", "red"],
  ["Durigutti", "Durigutti", "Cabernet Franc", "Mendoza", "red"],
  ["SuperUco", "SuperUco Calcáreo", "Malbec", "Los Chacayes, Mendoza", "red"],
  ["Cara Sur", "Cara Sur", "Criolla", "Barreal, San Juan", "red"],
  ["Manos Negras", "Manos Negras", "Pinot Noir", "Río Negro, Patagonia", "red"],
  ["Otronia", "Otronia 45 Rugientes", "Pinot Noir", "Sarmiento, Chubut", "red"],
  ["Otronia", "Otronia 45 Rugientes", "Chardonnay", "Sarmiento, Chubut", "white"],
  ["Bodega del Fin del Mundo", "Fin del Mundo Reserva", "Malbec", "Neuquén, Patagonia", "red"],
  ["Bodega del Fin del Mundo", "Fin del Mundo Postales", "Malbec", "Neuquén, Patagonia", "red"],
  ["Bodega del Fin del Mundo", "Newen", "Malbec", "Neuquén, Patagonia", "red"],

  // --- Más clásicas y varietales menos comunes ---
  ["Trapiche", "Trapiche Medalla", "Malbec", "Maipú, Mendoza", "red"],
  ["Luigi Bosca", "Luigi Bosca", "Riesling", "Luján de Cuyo, Mendoza", "white"],
  ["Doña Paula", "Doña Paula Estate", "Sauvignon Blanc", "Valle de Uco, Mendoza", "white"],
  ["Bodegas Salentein", "Salentein Reserve", "Chardonnay", "Valle de Uco, Mendoza", "white"],
  ["Familia Zuccardi", "Zuccardi Serie A", "Bonarda", "Valle de Uco, Mendoza", "red"],
  ["El Esteco", "Fincas Notables", "Cabernet Sauvignon", "Cafayate, Salta", "red"],
  ["El Esteco", "Ciclos", "Blend", "Cafayate, Salta", "red"],
  ["Piattelli", "Piattelli Reserve", "Malbec", "Cafayate, Salta", "red"],
  ["Piattelli", "Piattelli Grand Reserve", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Amalaya", "Amalaya", "Malbec", "Valle Calchaquí, Salta", "red"],
  ["Amalaya", "Amalaya", "Torrontés Riesling", "Valle Calchaquí, Salta", "white"],
  ["Colomé", "Colomé Amalaya Gran Corte", "Blend", "Valle Calchaquí, Salta", "red"],
  ["Alta Vista", "Alta Vista Classic", "Torrontés", "Salta", "white"],
  ["Kaiken", "Kaiken Ultra", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Kaiken", "Kaiken Estate", "Malbec", "Mendoza", "red"],
  ["Kaiken", "Kaiken Corte", "Blend", "Mendoza", "red"],
  ["Kaiken", "Kaiken Aventura", "Malbec", "Los Chacayes, Mendoza", "red"],
  ["Ruca Malen", "Ruca Malen Yauquén", "Malbec", "Mendoza", "red"],
  ["Ruca Malen", "Ruca Malen Reserva", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Ruca Malen", "Kinien", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Andeluna", "Andeluna 1300", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Andeluna", "Andeluna Altitud", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Andeluna", "Andeluna Pasionado", "Cabernet Franc", "Valle de Uco, Mendoza", "red"],
  ["Bodega Atamisque", "Atamisque", "Malbec", "Tupungato, Mendoza", "red"],
  ["Bodega Atamisque", "Serbal", "Malbec", "Tupungato, Mendoza", "red"],
  ["Bodega Atamisque", "Catalpa", "Chardonnay", "Tupungato, Mendoza", "white"],
  ["Finca Sophenia", "Sophenia Reserve", "Malbec", "Gualtallary, Mendoza", "red"],
  ["Finca Sophenia", "Sophenia Synthesis", "Blend", "Gualtallary, Mendoza", "red"],
  ["Monteviejo", "Lindaflor", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Monteviejo", "Petite Fleur", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Clos de los Siete", "Clos de los Siete", "Blend", "Valle de Uco, Mendoza", "red"],
  ["Rolland", "Val de Flores", "Malbec", "Vista Flores, Mendoza", "red"],
  ["Cheval des Andes", "Cheval des Andes", "Blend", "Luján de Cuyo, Mendoza", "red"],
  ["Viña Cobos", "Cobos Bramare", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Viña Cobos", "Cobos Felino", "Malbec", "Mendoza", "red"],
  ["Viña Cobos", "Cobos", "Malbec", "Marchiori Vineyard, Mendoza", "red"],
  ["Casarena", "Casarena Reserva", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Casarena", "Casarena Single Vineyard", "Cabernet Franc", "Agrelo, Mendoza", "red"],
  ["Bodega Piedra Negra", "Lurton Gran Lurton", "Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Bodega Piedra Negra", "Lurton Piedra Negra", "Malbec", "Los Chacayes, Mendoza", "red"],
  ["Finca Flichman", "Flichman Dedicado", "Malbec", "Mendoza", "red"],
  ["Finca Flichman", "Flichman Misterio", "Malbec", "Mendoza", "red"],
  ["Bodega Séptima", "Séptima Obra", "Malbec", "Agrelo, Mendoza", "red"],
  ["Bodega Séptima", "Séptima Gran Reserva", "Blend", "Agrelo, Mendoza", "red"],
  ["Navarro Correas", "Navarro Correas Colección Privada", "Malbec", "Mendoza", "red"],
  ["Navarro Correas", "Navarro Correas Alegoría", "Cabernet Sauvignon", "Mendoza", "red"],
  ["Bodega Sottano", "Sottano Reserva de Familia", "Malbec", "Agrelo, Mendoza", "red"],
  ["Bodega Sottano", "Sottano Judas", "Blend", "Mendoza", "red"],
  ["Finca La Celia", "La Celia Reserva", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Finca La Celia", "La Celia Pioneer", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Bodega Melipal", "Melipal", "Malbec", "Agrelo, Mendoza", "red"],
  ["Bodega Melipal", "Ikella", "Malbec", "Agrelo, Mendoza", "red"],
  ["Altos Las Hormigas", "Altos Las Hormigas", "Malbec", "Mendoza", "red"],
  ["Altos Las Hormigas", "Altos Las Hormigas Reserva", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Bodega Chakana", "Chakana Estate", "Malbec", "Agrelo, Mendoza", "red"],
  ["Bodega Chakana", "Chakana Nuna", "Malbec", "Agrelo, Mendoza", "red"],
  ["Zorzal", "Zorzal Terroir Único", "Cabernet Franc", "Gualtallary, Mendoza", "red"],
  ["Zorzal", "Zorzal Eggo", "Malbec", "Gualtallary, Mendoza", "red"],
  ["Gimenez Riili", "Gimenez Riili Reserva", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Corazón del Sol", "Corazón del Sol", "Blend", "Los Chacayes, Mendoza", "red"],
  ["Bodega Los Toneles", "Fuego Blanco", "Malbec", "San Juan", "red"],
  ["Krontiras", "Krontiras Doña Silvina", "Malbec", "Maipú, Mendoza", "red"],
  ["Ernesto Catena", "Alma Negra Misterio", "Blend", "Vista Flores, Mendoza", "red"],
  ["Ernesto Catena", "Tikal Patriota", "Blend", "Mendoza", "red"],
  ["Ernesto Catena", "Siesta", "Malbec", "Mendoza", "red"],
  ["Escorihuela Gascón", "Escorihuela Gascón 1884", "Malbec", "Mendoza", "red"],
  ["Nieto Senetiner", "Cadus", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Trivento", "Trivento Eolo", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Dominio del Plata", "BenMarco Expresivo", "Blend", "Valle de Uco, Mendoza", "red"],
  ["Bianchi", "Bianchi Famiglia", "Malbec", "San Rafael, Mendoza", "red"],
  ["Bianchi", "Bianchi 1887", "Malbec", "San Rafael, Mendoza", "red"],
  ["Bianchi", "Enzo Bianchi Gran Cru", "Blend", "San Rafael, Mendoza", "red"],
  ["Valentín Bianchi", "Don Valentín Lacrado", "Tinto", "San Rafael, Mendoza", "red"],
  ["Goyenechea", "Goyenechea Centenario", "Cabernet Sauvignon", "San Rafael, Mendoza", "red"],
  ["Suter", "Etiqueta Marrón", "Tinto", "San Rafael, Mendoza", "red"],

  // --- Populares que faltaban --- (SIN VERIFICAR contra sitio oficial)
  ["Familia Zuccardi", "Fuzión", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Fuzión", "Shiraz Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Fuzión", "Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Fuzión", "Torrontés", "Valle de Uco, Mendoza", "white"],
  ["Familia Zuccardi", "Fuzión", "Chardonnay", "Valle de Uco, Mendoza", "white"],
  ["Finca Las Moras", "Dadá", "Blend", "Valle de Tulum, San Juan", "red"],
  ["Finca Las Moras", "Dadá", "Malbec", "Valle de Tulum, San Juan", "red"],
  ["Finca Las Moras", "Dadá", "Cabernet Sauvignon", "Valle de Tulum, San Juan", "red"],
  ["Nieto Senetiner", "Benjamín Nieto Senetiner", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Nieto Senetiner", "Benjamín Nieto Senetiner", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Nieto Senetiner", "Benjamín Nieto Senetiner", "Chardonnay", "Luján de Cuyo, Mendoza", "white"],
  ["Nieto Senetiner", "Benjamín Nieto Senetiner", "Bonarda", "Luján de Cuyo, Mendoza", "red"],
  ["Trivento", "Tilia", "Malbec", "Mendoza", "red"],
  ["Trivento", "Tilia", "Cabernet Sauvignon", "Mendoza", "red"],
  ["Trivento", "Tilia", "Chardonnay", "Mendoza", "white"],
  ["Trivento", "Tilia", "Torrontés", "Mendoza", "white"],
  ["Bodega La Mascota", "La Mascota", "Malbec", "Maipú, Mendoza", "red"],
  ["Bodega La Mascota", "La Mascota", "Cabernet Sauvignon", "Maipú, Mendoza", "red"],
  ["Bodega La Mascota", "La Mascota", "Chardonnay", "Maipú, Mendoza", "white"],
  ["Fincas Patagónicas", "Zolo", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Fincas Patagónicas", "Zolo", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Fincas Patagónicas", "Zolo", "Torrontés", "Luján de Cuyo, Mendoza", "white"],
  ["Antigal", "Antigal Uno", "Malbec", "Luján de Cuyo, Mendoza", "red"],
  ["Antigal", "Antigal Uno", "Cabernet Sauvignon", "Luján de Cuyo, Mendoza", "red"],
  ["Bodega Gouguenheim", "Gouguenheim", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Bodega Gouguenheim", "Gouguenheim", "Cabernet Sauvignon", "Valle de Uco, Mendoza", "red"],
  ["Bodega Gouguenheim", "Gouguenheim", "Chardonnay", "Valle de Uco, Mendoza", "white"],
  ["Pascual Toso", "Pascual Toso", "Malbec", "Maipú, Mendoza", "red"],
  ["Pascual Toso", "Pascual Toso", "Cabernet Sauvignon", "Maipú, Mendoza", "red"],
  ["Pascual Toso", "Pascual Toso", "Chardonnay", "Maipú, Mendoza", "white"],
  ["Bodegas Balbo", "Viñas de Balbo", "Malbec", "Mendoza", "red"],
  ["Bodegas Balbo", "Viñas de Balbo", "Cabernet Sauvignon", "Mendoza", "red"],
  ["Bodegas Balbo", "Viñas de Balbo", "Blend", "Mendoza", "red"],
  ["Bodega Callia", "Callia Elementos", "Malbec", "Valle de Tulum, San Juan", "red"],
  ["Bodega Callia", "Callia Elementos", "Syrah", "Valle de Tulum, San Juan", "red"],
  ["Bodega Callia", "Callia Elementos", "Torrontés", "Valle de Tulum, San Juan", "white"],
  ["Bodega Estancia Mendoza", "Estancia Mendoza", "Malbec", "Mendoza", "red"],
  ["Bodega Estancia Mendoza", "Estancia Mendoza", "Cabernet Sauvignon", "Mendoza", "red"],
  ["Bodega Estancia Mendoza", "Estancia Mendoza", "Chardonnay", "Mendoza", "white"],

  // --- Santa Julia --- (verificado contra santajulia.com.ar, jul 2026)
  ["Familia Zuccardi", "Santa Julia Varietales", "Malbec", "Maipú, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia Varietales", "Cabernet Sauvignon", "Maipú, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia Varietales", "Cabernet Franc", "Maipú, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia Varietales", "Torrontés", "Maipú, Mendoza", "white"],
  ["Familia Zuccardi", "Santa Julia Varietales", "Pinot Grigio", "Maipú, Mendoza", "white"],
  ["Familia Zuccardi", "Santa Julia Varietales", "Rosé", "Maipú, Mendoza", "rosé"],
  ["Familia Zuccardi", "Santa Julia Valle de Uco", "Malbec", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia Valle de Uco", "Cabernet Franc", "Valle de Uco, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia Orgánico", "Malbec", "Maipú, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia Orgánico", "Cabernet Sauvignon", "Maipú, Mendoza", "red"],
  ["Familia Zuccardi", "Santa Julia Orgánico", "Torrontés", "Maipú, Mendoza", "white"],
];

// Normaliza texto para comparar sin acentos ni mayúsculas.
const fold = (text = "") =>
  String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const slug = (text) => fold(text).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Etiqueta en español del tipo, para poder buscar "tinto", "blanco", etc.
const TYPE_ES = {
  red: "tinto",
  white: "blanco",
  "rosé": "rosado rose",
  sparkling: "espumante espumoso",
  fortified: "fortificado",
};

const CATALOG = RAW.map(([winery, line, varietal, region, type]) => {
  // La línea ya identifica al vino ("Catena Alta", "Alamos"), así que el nombre
  // visible es "<línea> <varietal>" y la bodega se muestra aparte en la tarjeta.
  const name = `${line} ${varietal}`.trim();
  return {
    id: `ar-${slug(`${winery}-${line}-${varietal}`)}`,
    name,
    // `line` como campo propio: es lo que permite deduplicar contra lo escaneado
    // y lo comunitario sin recortar substrings del nombre.
    line,
    winery,
    region,
    varietal,
    type,
    image: "",
    vintage: "",
    rating: 0,
    barcode: "",
    country: region.includes("Uruguay") ? "Uruguay" : "Argentina",
    source: "catalogo-ar",
    // Índice de búsqueda: nombre, varietal, bodega, región y el tipo en español
    // (así "tinto"/"blanco" también matchean).
    haystack: fold(`${line} ${varietal} ${winery} ${region} ${TYPE_ES[type] || ""}`),
  };
});

module.exports = { CATALOG, fold };

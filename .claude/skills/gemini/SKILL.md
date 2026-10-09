---
name: gemini
description: Cómo se usa Gemini en Rincones (Sommelier, descripciones, escáner de etiquetas): modelos que piensan, streaming SSE, fallbacks y salida no confiable. Usar al tocar gemini.service, sommelier.service, wineAi, labels/vision o sommelierStream.
---

# Gemini

Código: `server/src/services/gemini.service.js`, `sommelier.service.js`, `wineAi.service.js`, `labels.service.js`, `vision.service.js`; cliente en `client/src/services/sommelierStream.js`.

## La salida de Gemini es dato NO confiable
Nunca `dangerouslySetInnerHTML`, nunca interpolarla en queries o HTML sin validar. Validar forma y tipos antes de persistir o renderizar.

## Los modelos flash PIENSAN
Un `gemini-3.6-flash` gastó 248 de 260 tokens pensando y cortó con `MAX_TOKENS`; sin pensar contesta en 1,7 s. Un 503 del primer modelo tarda ~14 s.
- El Sommelier pide `sinPensamiento: true` (`thinkingBudget: 0`): respuestas de 12–22 s a 3–5 s.
- Los lite más nuevos rechazan el parámetro con 400: `generateJson` y `streamJson` lo detectan, reintentan ESE modelo sin él y lo recuerdan.
- El escáner de etiquetas **no** lo usa (es opt-in).
- Antes de culpar a la red por una respuesta lenta, **medir**: llamada directa con y sin `thinkingConfig`.

## Streaming
La respuesta en vivo es **SSE por `fetch`**, no `axios` (axios espera el cuerpo entero). Si un intermediario bufferiza, llega todo junto: sigue andando sin el efecto de escritura. Una falla **antes** de empezar vuelve a la vía normal (`SinStreaming`); **después** de empezar no se cambia de modelo.

## Costos y límites
`server/src/middleware/aiLimiter.js` limita las llamadas. Todo endpoint nuevo que llame a Gemini pasa por ahí y por auth.

# Prompt: Flora — Galaxia de flores controlada con las manos (versión premium)

Copia y pega este prompt completo en Claude (o cualquier IA de código):

---

Actúa como un equipo senior formado por un desarrollador creativo de WebGL, un ingeniero de visión por computadora y un diseñador de producto de lujo. Vas a construir **"Flora — Galaxia de flores"**, una experiencia web interactiva de calidad profesional, digna de un estudio creativo, que se vería en un sitio premiado.

## 1. Concepto

Una galaxia espiral hecha de **miles de flores amarillas** que flota en el espacio. El usuario la controla con **gestos de sus manos**, que capta la webcam en tiempo real. La estética es negra y dorada, elegante, cinematográfica y minimalista, como una marca de lujo.

## 2. Stack y restricciones

- HTML + CSS + JavaScript con **módulos ES nativos**, **sin paso de compilación**.
- **Three.js r160** (importmap desde cdn.jsdelivr.net, incluyendo `three/addons/` para post-procesado).
- **MediaPipe Tasks Vision – HandLandmarker** (`@mediapipe/tasks-vision`), modo `VIDEO`, 2 manos. Carga dinámica (`import()`) solo al activar la cámara. Delegado GPU con respaldo automático a CPU.
- Fuentes de Google Fonts: **Cormorant Garamond** (display) + **Inter** (interfaz).
- Todo el procesamiento de video es local. Muestra un mensaje de privacidad.

## 3. Arquitectura de archivos

```
index.html · css/styles.css · assets/favicon.svg
js/main.js         orquestación, bucle, cámara orbital, ratón/táctil/teclado, capturas
js/config.js       niveles de calidad (alta/media/baja, auto por dispositivo o ?calidad=)
js/galaxy.js       flores, polen, nebulosas y núcleo con shaders GLSL propios
js/textures.js     texturas procedurales en <canvas> (sin imágenes externas)
js/starfield.js    estrellas titilantes
js/postfx.js       EffectComposer: RenderPass → UnrealBloom → OutputPass → pase final
js/hand-tracker.js cámara + HandLandmarker, con errores claros en español
js/gestures.js     motor de gestos PURO (sin DOM), testeable con Node
js/one-euro.js     filtro One Euro
js/audio.js        paisaje sonoro generativo con Web Audio
js/ui.js           interfaz
tests/gestures.test.mjs   pruebas con node:test y manos sintéticas
package.json (scripts start/test) · README.md profesional
```

## 4. La galaxia (GPU)

- Las posiciones se calculan en el **vertex shader** a partir de atributos (radio, ángulo, altura, fase). Nada se mueve en la CPU.
- Distribución: bulbo central (12 %), campo disperso entre brazos (8 %) y **4 brazos espirales** con dispersión gaussiana que crece con el radio.
- **Rotación diferencial periódica**: los brazos respiran pero nunca se enrollan del todo.
- Uniform `uBloom` (0 = capullo, 1 = abierta) que escala radio y grosor del disco.
- **Flores**: `THREE.Points` con un **atlas 2×2 de 4 especies** dibujadas en canvas: margarita, ranúnculo, girasol (disco con semillas en espiral de Fermat, ángulo áureo) y cosmos (pétalos con punta dentada). Cada pétalo lleva degradado, nervadura, brillo satinado y halo. Cada flor tiene tamaño, especie, giro propio, brillo y tinte (dorado cálido en el centro → amarillo pálido afuera). Un 2,5 % son flores "protagonistas" más grandes. El tamaño depende de la perspectiva y se desvanece cerca de la cámara.
- **Polen**: ~28 000 puntos aditivos dorados que titilan. Se atenúan al contraerse la galaxia para no saturar.
- **Nebulosas**: nubes aditivas ámbar/rosa-dorado de baja opacidad a lo largo de los brazos.
- **Núcleo**: dos sprites aditivos (núcleo blanco-dorado + halo amplio) que respiran.
- **Estrellas**: miles de puntos lejanos con tonos blanco cálido, dorado y azul pálido, titilando.
- **Post-procesado**: UnrealBloom, tone mapping ACES, viñeta, grano de película (hash sin senos, sin tramas), aberración cromática solo en los bordes y destello blanco al capturar.

## 5. Motor de gestos (`gestures.js`)

- Rasgos por mano, normalizados por el tamaño de la palma:
  - centro de la palma en espejo;
  - apertura (distancia media de las puntas a la muñeca);
  - pellizco (pulgar–índice);
  - dedos extendidos;
  - señal de paz.
- Suavizado con **filtro One Euro** por mano (posición, apertura, pellizco). Manos ordenadas de izquierda a derecha para una identidad estable.
- **Histéresis** en el pellizco y **anti-rebote** de 120 ms en los cambios de gesto.
- Gestos y efectos:
  - 🙌 **Dos manos**: zoom **relativo** al inicio del gesto (`zoom = zoomInicial · (distancia/distanciaInicial)^1.3`, con límites). Girarlas como un volante rota la galaxia. El zoom **se conserva** al retirar las manos.
  - ✋ **Mano abierta** → florecer (sube `bloom`). ✊ **Puño** → recoger.
  - La posición de la mano orienta suavemente la cámara.
  - 🤏 **Pellizco** → ondas de luz que viajan del centro hacia afuera + campanilla.
  - 👋 **Barrido rápido** → impulso de giro con inercia.
  - ✌️ **Señal de paz sostenida 1,1 s** → captura (una sola vez por gesto, con anillo de progreso).
- Emite eventos (`mode`, `swipe`, `capture`) y expone los cursores de cada mano.

## 6. Cámara y movimiento

- Cámara en órbita esférica alrededor del núcleo. Distancia = base / zoom, ajustada a la proporción de pantalla (en vertical se aleja para que la galaxia quepa).
- Todos los valores se suavizan con **amortiguación exponencial independiente de los FPS**.
- Auto-rotación lenta y oscilación sutil de inclinación. Vuelo de entrada al comenzar.
- Alternativas sin cámara:
  - ratón (arrastrar = orbitar, rueda = zoom, mantener pulsado = resplandor);
  - táctil (deslizar y pellizcar con dos dedos);
  - teclado: F pantalla completa, S captura, M sonido, C cámara, H ocultar interfaz, R restablecer, ↑↓ floración, Espacio resplandor, ? ayuda.

## 7. Interfaz de lujo

- Paleta: negro `#050507`, tinta marfil `#F4EEDC`, oro `#E9C46A`. Líneas finas doradas translúcidas. Paneles de **cristal esmerilado**. Números tabulares.
- **Intro**: marca floral en SVG girando lentamente, antetítulo en versalitas espaciadas, título "Flora" enorme con degradado dorado, subtítulo en cursiva, regla dorada y dos botones:
  - "Comenzar con cámara": dorado, con brillo que cruza al pasar el ratón.
  - "Explorar sin cámara": fantasma.
  - Debajo, una nota de privacidad.
  - La galaxia se ve atenuada detrás.
- **Pasos de carga** con spinner → check: Cámara, Modelo de visión artificial, Calibración. Cámara y modelo cargan en paralelo. Los errores se muestran en español claro (permiso denegado, sin cámara, cámara ocupada, contexto no seguro, fallo de red).
- **HUD**:
  - marca arriba a la izquierda;
  - telemetría arriba a la derecha (zoom, floración, manos, latencia de la IA, FPS);
  - guía de gestos a la izquierda, que ilumina el gesto activo con una barra dorada;
  - indicador vertical de zoom logarítmico a la derecha;
  - nombre del gesto actual centrado abajo, en cursiva grande con subtítulo;
  - dock de iconos abajo a la izquierda con tooltips (sonido, cámara, captura, pantalla completa, ayuda);
  - vista de la cámara abajo a la derecha, en espejo y desaturada, con el esqueleto de la mano en oro con resplandor y la etiqueta "Visión IA · N manos".
- **Cursores de mano** sobre la escena: anillo + punto dorado que se encoge al pellizcar, anillo de progreso para la captura y, con dos manos, una línea punteada entre ellas con una píldora "×2.41".
- Avisos (toasts), pista "Muestra tus manos" si no se detectan en 4,5 s, y diálogo de ayuda con gestos y atajos.
- Responsive: en móvil se ocultan la guía y el indicador de zoom, la vista de cámara pasa arriba y el dock se centra. Respeta `prefers-reduced-motion`. Botones con foco visible y `aria-*`.

## 8. Extras premium

- **Captura PNG** con firma tipográfica ("Flora" + "GALAXIA DE FLORES · fecha") y destello.
- **Sonido generativo** opcional:
  - acorde de La mayor con novena en osciladores desafinados y LFO lentos;
  - reverb por convolución generada;
  - filtro que se abre con la floración y el zoom;
  - campanillas pentatónicas al pellizcar o barrer.
- **Resolución dinámica**: si baja de 40 fps durante 2 s, reduce el pixel ratio.
- Modo `?debug` que expone `window.flora.simulate(manos)` para probar gestos sin cámara.

## 9. Entrega

- Código completo de todos los archivos, comentado en español, limpio y consistente.
- `npm start` para servir en localhost y `npm test` para las pruebas del motor de gestos.
- README profesional con características, gestos, atajos, ejecución, arquitectura, pruebas, compatibilidad y privacidad.

---

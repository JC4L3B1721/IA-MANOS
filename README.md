<div align="center">

# ✿ Flora — Galaxia de flores

**Una galaxia de miles de flores amarillas orbitando un agujero negro, controlada con más de 15 gestos de tus manos al estilo holográfico de Tony Stark.**

WebGL · Three.js · MediaPipe Hand Landmarker · Web Audio

</div>

---

Flora usa la cámara y visión artificial para leer 21 puntos de cada mano y convertirlos en gestos. Las flores orbitan alrededor de una singularidad y caen en espiral hacia su horizonte. Con las manos puedes:

- abrir y recoger la galaxia;
- provocar supernovas y ondas de choque;
- cargar orbes de energía;
- colapsar todo en el agujero negro y liberarlo en un Big Bang;
- saltar al hiperespacio.

Todo se procesa en tu dispositivo: **ninguna imagen sale del navegador**.

## Características

- **Agujero negro** con:
  - sombra del horizonte y anillo de fotones;
  - disco de acreción turbulento con rotación kepleriana y beaming relativista (un lado más brillante);
  - la imagen curvada de la cara oculta del disco;
  - **lente gravitacional** que deforma las estrellas a su alrededor.
- **9 especies de flores dibujadas proceduralmente**: margarita doble, ranúnculo en capas, girasol, cosmos, dalia, loto, lirio estrella con pecas, crisantemo araña y una flor cósmica translúcida. Llevan nervaduras, sombras, reflejos satinados, estambres, destellos especulares y un volteo 3D animado.
- **Galaxia calculada en la GPU**:
  - hasta 14 000 flores y 28 000 partículas de polen, más nebulosas y bandas de polvo oscuro;
  - flores y polen caen en espiral hacia la singularidad y se calientan hasta brillar como plasma;
  - 5 paletas cósmicas: Sol dorado, Eclipse carmesí, Nebulosa cuántica, Aurora boreal y Plasma violeta.
- **Post-procesado cinematográfico**: lente gravitacional, ondas de choque refractivas, bloom, tone mapping ACES, desenfoque radial de hiperespacio, modo holograma, viñeta y grano.
- **HUD holográfico al estilo Stark**:
  - esqueleto de tus manos proyectado a pantalla completa, con coordenadas;
  - retículas de mira giratorias con el estado de cada mano;
  - orbe de energía entre las manos;
  - marcador de la singularidad;
  - registro de eventos;
  - panel de análisis espectral con barrido de escaneo;
  - modo holograma con cuadrícula y marco.
- **Motor de gestos profesional**: filtro One Euro contra el temblor, histéresis, anti-rebote y zoom relativo sin saltos. Tiene pruebas automatizadas.
- **Interfaz de lujo**: tipografía Cormorant Garamond + Inter, cristal esmerilado, telemetría en vivo, guía de gestos que se ilumina, cursores de mano con anillo de progreso y vista de la cámara con el esqueleto de la mano.
- **Paisaje sonoro generativo** (opcional): un acorde ambiental que se abre con la floración y campanillas al pellizcar.
- **Captura con firma**: guarda un PNG con marca elegante (botón, tecla `S` o la señal de paz ✌️).
- **Rendimiento adaptativo**: calidad según el dispositivo y resolución dinámica si baja de 40 fps.
- **Funciona sin cámara**: con ratón o pantalla táctil (arrastrar, rueda o pellizco táctil).

## Gestos

| Gesto | Efecto |
|---|---|
| 🙌 **Dos manos**: separar / juntar | Acercar / alejar la galaxia |
| 🙌 **Dos manos**: girar como un volante | Rotar la galaxia |
| 🙏 **Manos casi juntas** | Carga un orbe de energía; al separarlas, **descarga** una onda expansiva |
| ✊✊ **Dos puños** | **Colapso**: todo cae en la singularidad; al soltar, **Big Bang** |
| ✋ **Mano abierta** | La galaxia florece y se expande |
| ✊ **Puño** | La galaxia se recoge como un capullo |
| ✊→✋ **Puño y abrir de golpe** | **Supernova** |
| 🫸 **Empujar la palma** hacia la cámara | **Repulsor**: onda de choque desde tu mano |
| ☝️ **Apuntar con el índice** | **Pozo de gravedad**: las flores giran alrededor de tu dedo |
| 🤏 **Pellizco** (pulgar + índice) | Ondas de luz recorren las flores |
| 🤘 **Cuernos** | Salto al **hiperespacio** |
| 👋 **Barrido lateral** | Impulsa la rotación |
| 👋 **Barrido vertical** | Cambia la paleta cósmica |
| 🤙 **Shaka** | Modo holograma |
| 👍 **Pulgar arriba** | Escaneo espectral |
| ✌️ **Señal de paz** sostenida 1 s | Guarda una imagen |
| 👉 **Mover la mano** | Inclina y orienta la vista |

## Teclado

| Tecla | Acción | Tecla | Acción |
|---|---|---|---|
| `F` | Pantalla completa | `H` | Ocultar la interfaz |
| `S` | Guardar imagen | `R` | Restablecer la vista |
| `M` | Sonido ambiental | `↑` `↓` | Floración |
| `C` | Cámara | `Espacio` | Resplandor |
| `N` / doble clic | Supernova | `X` (mantener) | Colapso → Big Bang |
| `W` (mantener) | Hiperespacio | `T` | Cambiar paleta |
| `G` | Modo holograma | `J` | Escaneo espectral |
| `?` | Ayuda | | |

## Cómo ejecutarlo

La cámara solo funciona en `https://` o en `http://localhost`, así que hay que servir la carpeta. No hace falta instalar nada:

```bash
npm start                    # usa "serve" en http://localhost:5173
# o bien
python -m http.server 8000   # y abre http://localhost:8000
```

Pulsa **Comenzar con cámara**, acepta el permiso y levanta una mano.

### Opciones por URL

| Parámetro | Efecto |
|---|---|
| `?calidad=alta` · `media` · `baja` | Fuerza el nivel de detalle (por defecto se elige según el dispositivo) |
| `?debug` | Expone `window.flora` para simular manos desde la consola |

## Arquitectura

```
index.html            Estructura, iconografía SVG y diálogo de ayuda
css/styles.css        Sistema visual (tokens, cristal, animaciones, responsive)
js/
  main.js             Orquestación: escena, bucle, cámara orbital, entrada, capturas
  config.js           Niveles de calidad, parámetros de galaxia y cámara, URLs de MediaPipe
  galaxy.js           Flores, polen, nebulosas y polvo con caída en espiral (shaders GLSL)
  blackhole.js        Horizonte, disco de acreción y anillo de fotones
  textures.js         Atlas de 9 flores, brillos y nubes dibujados en <canvas>
  starfield.js        Cielo de estrellas titilantes
  postfx.js           Lente gravitacional, ondas de choque, bloom, hiperespacio, holograma
  hand-tracker.js     Cámara + MediaPipe Hand Landmarker (GPU con respaldo en CPU)
  gestures.js         Motor de gestos puro (sin DOM), probado con Node
  one-euro.js         Filtro One Euro para suavizar sin retraso
  audio.js            Paisaje sonoro y efectos (supernova, repulsor, hiperespacio)
  ui.js               HUD holográfico: esqueleto, retículas, orbe, registro, escaneo
tests/                Pruebas del motor de gestos con manos sintéticas
assets/favicon.svg
```

## Pruebas

```bash
npm test
```

Las pruebas generan manos sintéticas con 8 posturas: abierta, puño, pellizco, paz, índice, cuernos, shaka y pulgar arriba. Con ellas verifican:

- la clasificación de cada gesto;
- el anti-rebote;
- el zoom con dos manos;
- los barridos;
- la supernova;
- el repulsor;
- la carga y descarga de energía;
- el colapso con su Big Bang;
- la captura.

## Compatibilidad

- Chrome, Edge y Brave (escritorio y Android), y Safari 16.4+ (macOS / iOS).
- Requiere WebGL 2 y una cámara frontal para el modo con gestos.

## Privacidad

El video se analiza localmente con MediaPipe (WebAssembly + WebGL). Solo se descargan el modelo y las librerías desde CDN públicos; nunca se envía ningún fotograma.

## Prompt

El prompt completo para generar este proyecto con una IA está en [`PROMPT.md`](PROMPT.md).

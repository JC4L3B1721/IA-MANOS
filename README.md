<div align="center">

# ✿ Flora — Galaxia de flores

**Una galaxia de miles de flores amarillas que controlas con tus manos, en tiempo real, desde el navegador.**

WebGL · Three.js · MediaPipe Hand Landmarker · Web Audio

</div>

---

Flora usa la cámara y visión artificial para leer 21 puntos de cada mano y convertirlos en gestos. Las flores orbitan en una galaxia espiral, florecen cuando abres la mano, se recogen con el puño y se acercan cuando separas las dos manos. Todo se procesa en tu dispositivo: **ninguna imagen sale del navegador**.

## Características

- **4 especies de flores dibujadas proceduralmente** (margarita, ranúnculo, girasol y cosmos), con semillas en espiral de Fermat según el ángulo áureo.
- **Galaxia calculada en la GPU**: hasta 14 000 flores, 28 000 partículas de polen, nebulosas y un núcleo luminoso. Tienen rotación diferencial y respiran.
- **Post-procesado cinematográfico**: bloom, tone mapping ACES, viñeta, grano de película y aberración cromática sutil.
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
| ✋ **Mano abierta** | La galaxia florece y se expande |
| ✊ **Puño** | La galaxia se recoge como un capullo |
| 🤏 **Pellizco** (pulgar + índice) | Ondas de luz recorren las flores |
| 👋 **Barrido rápido** | Impulsa la rotación |
| ✌️ **Señal de paz** sostenida 1 s | Guarda una imagen |
| 👉 **Mover la mano** | Inclina y orienta la vista |

## Teclado

| Tecla | Acción | Tecla | Acción |
|---|---|---|---|
| `F` | Pantalla completa | `H` | Ocultar la interfaz |
| `S` | Guardar imagen | `R` | Restablecer la vista |
| `M` | Sonido ambiental | `↑` `↓` | Floración |
| `C` | Cámara | `Espacio` | Resplandor |
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
  galaxy.js           Flores, polen, nebulosas y núcleo (shaders GLSL)
  textures.js         Atlas de 4 flores, brillos y nubes dibujados en <canvas>
  starfield.js        Cielo de estrellas titilantes
  postfx.js           Bloom, tone mapping, viñeta, grano y aberración
  hand-tracker.js     Cámara + MediaPipe Hand Landmarker (GPU con respaldo en CPU)
  gestures.js         Motor de gestos puro (sin DOM), probado con Node
  one-euro.js         Filtro One Euro para suavizar sin retraso
  audio.js            Paisaje sonoro generativo con Web Audio
  ui.js               Interfaz: intro, telemetría, cursores, vista de cámara, avisos
tests/                Pruebas del motor de gestos con manos sintéticas
assets/favicon.svg
```

## Pruebas

```bash
npm test
```

Las pruebas generan manos sintéticas (abierta, puño, pellizco, señal de paz) y verifican:

- la clasificación de cada gesto;
- el efecto espejo;
- el anti-rebote;
- el zoom con dos manos: que sea proporcional, que tenga límites y que se conserve al retirar las manos;
- la captura única;
- el barrido.

## Compatibilidad

- Chrome, Edge y Brave (escritorio y Android), y Safari 16.4+ (macOS / iOS).
- Requiere WebGL 2 y una cámara frontal para el modo con gestos.

## Privacidad

El video se analiza localmente con MediaPipe (WebAssembly + WebGL). Solo se descargan el modelo y las librerías desde CDN públicos; nunca se envía ningún fotograma.

## Prompt

El prompt completo para generar este proyecto con una IA está en [`PROMPT.md`](PROMPT.md).

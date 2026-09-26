# Prompt: Galaxia de flores amarillas controlada con las manos

Copia y pega este prompt completo en Claude (o cualquier IA de código):

---

Actúa como un desarrollador experto en visión por computadora y gráficos 3D para la web.

Crea una aplicación web completa en **un solo archivo `index.html`** (HTML + CSS + JavaScript, sin pasos de compilación) que:

## 1. Detección de manos con la cámara
- Pide permiso para usar la webcam con `navigator.mediaDevices.getUserMedia`.
- Usa **MediaPipe Tasks Vision – HandLandmarker** (`@mediapipe/tasks-vision` desde cdn.jsdelivr.net) en modo `VIDEO`, detectando **hasta 2 manos** con sus 21 puntos (landmarks).
- Muestra una vista previa pequeña de la cámara en una esquina, **en espejo**, con los puntos y conexiones de la mano dibujados en amarillo.
- Aplica suavizado (interpolación lineal / lerp) a todos los valores para que la animación no tiemble.

## 2. Animación: galaxia de flores amarillas
- Usa **Three.js** (importmap desde cdn.jsdelivr.net) con fondo negro/azul muy oscuro.
- Genera una **galaxia espiral** con 5 brazos y unas 6000 partículas, donde **cada partícula es una flor amarilla** (textura dibujada en un `<canvas>`: 6 pétalos amarillos con degradado y centro naranja/café).
- Cada flor tiene tamaño, color (del dorado/naranja en el centro al amarillo pálido en los bordes) y rotación aleatorios; los pétalos giran lentamente sobre sí mismos (ShaderMaterial con atributos `aSize`, `aColor`, `aRot`).
- Un núcleo brillante con resplandor dorado en el centro y un fondo de estrellas pequeñas.
- La galaxia gira lentamente todo el tiempo.

## 3. Control con gestos de las manos
- **Dos manos**: la distancia entre las palmas controla el zoom → separar las manos **amplía** la galaxia, juntarlas la **reduce** (como "pinch to zoom" en el aire).
- **Una mano abierta / puño**: mano abierta = galaxia grande y expandida, puño cerrado = galaxia pequeña (usa la distancia promedio de las puntas de los dedos a la muñeca, normalizada por el tamaño de la palma).
- **Mover la mano** (posición de la palma) inclina y rota la galaxia en 3D.
- **Pellizco** (pulgar + índice juntos): hace que las flores brillen/pulsen.
- Sin manos: la galaxia vuelve suavemente a su tamaño normal y sigue girando sola.
- Respaldo: la rueda del mouse también hace zoom.

## 4. Interfaz
- Pantalla inicial con título "Galaxia de Flores ✿" y un botón **"Iniciar cámara"**.
- HUD con: estado (cargando modelo / manos detectadas), gesto actual y porcentaje de zoom.
- Diseño responsive (funciona en móvil y PC), letras en español.
- Maneja errores: si no hay permiso de cámara, muestra un mensaje claro.

## 5. Entrega
- Código completo, comentado en español, listo para abrir.
- Indica cómo ejecutarlo: la cámara solo funciona en `https://` o `http://localhost`, por ejemplo con `npx serve .` o `python -m http.server 8000`.

---

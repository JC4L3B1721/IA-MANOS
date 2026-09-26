# IA-MANOS · Galaxia de Flores ✿

Galaxia espiral de flores amarillas (Three.js) que se controla con las manos usando la cámara y
MediaPipe Hand Landmarker.

## Gestos

| Gesto | Efecto |
|---|---|
| 🙌 Dos manos: separarlas / juntarlas | Ampliar / reducir la galaxia |
| ✋ Mano abierta / ✊ puño | Galaxia grande / pequeña |
| 👉 Mover la mano | Girar e inclinar la galaxia |
| 🤏 Pellizco (pulgar + índice) | Las flores brillan y laten |
| 🖱️ Rueda del mouse | Zoom de respaldo |

## Cómo ejecutarlo

La cámara solo funciona en `https://` o en `http://localhost`, así que sírvelo con un servidor local:

```bash
npx serve .
# o
python -m http.server 8000
```

Abre `http://localhost:8000` (o la URL que muestre `serve`), pulsa **Iniciar cámara** y acepta el permiso.

## Prompt

El prompt completo para generar este proyecto con una IA está en [`PROMPT.md`](PROMPT.md).

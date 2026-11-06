# Peugeot 208 · taller

Web personal para tu Peugeot 208 5P Style 1.2 PureTech 82 CV (2016):

- **Home 3D** (`index.html`): coche que gira, zonas por etiquetas (carrocería, motor, frenos, ruedas…), piezas navegables y, en cada una, las páginas del manual que hay que mirar.
- **Registros** (`mantenimiento.html`): historial de mantenimiento con avisos por km o fecha, filtros, copia de seguridad y ficha del coche.

No hay servidor ni base de datos: son archivos estáticos. Los registros se guardan en el navegador de cada dispositivo.

## Probarla en tu ordenador

```bash
cd coche208
python3 -m http.server 8000
# abre http://localhost:8000
```

(No funciona abriendo el archivo con doble clic, porque los módulos de JavaScript necesitan un servidor.)

## Publicarla

1. Crea un repositorio **privado** en GitHub y sube el contenido de esta carpeta.
2. Conéctalo a Cloudflare Pages, Vercel o Netlify (gratis, permiten repositorios privados). Sin comando de build y con la carpeta raíz como directorio de salida.
3. Si la web va a ser pública, cualquiera con el enlace verá tu ficha y tus registros (se guardan solo en tu navegador, pero la ficha por defecto lleva datos del coche). Protégela con contraseña o no la compartas.

**No subas el PDF del manual al repositorio.** El `.gitignore` ya excluye los `.pdf`. La web solo guarda números de página; tú abres el PDF unificado aparte.

## El manual

Las referencias son páginas del archivo `Peugeot208_1.2_PureTech_82_manual_unificado.pdf`:

- Páginas 1-16: extracto recortado a tu coche (pares, pastillas, motor).
- Páginas 17 en adelante: el manual completo por secciones (la lista está en `js/data.js`, constante `SECCIONES`).

En **Ajustes** puedes poner la dirección del PDF (por ejemplo, un enlace de tu almacenamiento en la nube). Entonces cada referencia tendrá un botón «Abrir» que salta a la página. Si no la pones, usa «Copiar» y busca la página en tu visor.

## Añadir información a una pieza

Todo está en `js/data.js`. Cada pieza tiene `refs`, una lista de páginas:

```js
refs: [R(858, 861, 'Desmontaje y montaje de la pinza delantera')]
```

`R(primera, última, 'título', 'nota opcional')`. Una pieza con `refs: []` muestra «Sin información registrada». También puedes añadir `datos` (valores rápidos como pares de apriete) y `nota`.

Las piezas que solo apuntan a una sección completa (`S(n)`) están pendientes de localizar la página exacta.

## Estructura

```
index.html            home 3D
mantenimiento.html    registros
css/style.css         estilos
js/data.js            etiquetas, piezas y páginas del manual   ← lo que más vas a tocar
js/car.js             modelo 3D del coche (generado por código, three.js)
js/app.js             lógica de la home
js/maint.js           lógica de los registros
js/common.js          ajustes, almacenamiento y utilidades
vendor/               three.js (incluido, no necesita internet)
```

## Modelo 3D y licencia

El coche es el modelo **«Peugeot 208 2017» de luizantonix** (Sketchfab), licencia **CC BY-NC-SA 4.0**:
solo uso no comercial, hay que citar al autor (ya aparece en Ajustes) y, si compartes el modelo, debe mantener la misma licencia.
Está en `assets/peugeot208.glb` (texturas reducidas a 1024 px, unos 3 MB). Detalles en `assets/LICENCIA-MODELO.txt`.
Si el modelo no carga, la web muestra una versión simple generada por código.

## Limitaciones conocidas

- El modelo es de un 208 de 2017 con cinco puertas: las llantas y algún detalle pueden no ser los de tu Style 2016. La carrocería es una sola pieza (no se abren puertas ni capó).
- Las piezas internas (motor, caja, frenos, batería…) son representaciones sencillas colocadas dentro del coche, no el modelo real.
- Hay que comprobar que los procedimientos de refrigeración, combustible y correa (sacados de la sección de motor, que mezcla varios motores) aplican al EB2.
- Pares de apriete: los de frenos y ruedas están verificados contra las tablas del manual; compruébalos siempre en la página indicada antes de apretar.
- Los registros no se sincronizan entre dispositivos: usa la copia de seguridad para pasarlos.

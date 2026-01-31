# Divide — Calculadora de gastos compartidos

Página web de acceso libre para calcular los gastos compartidos en salidas con amigos. Permite ver quién debe pagar a quién y cuánto para quedar a mano.

## Características

- **Sin autenticación**: Acceso libre e inmediato
- **Participantes ilimitados**: Añade todos los amigos que participen
- **Múltiples gastos**: Registra cada gasto indicando quién pagó
- **Cálculo automático**: Divide el total a partes iguales y calcula las transacciones mínimas necesarias
- **Exportar**: Descarga el resumen en PDF o imagen PNG para compartir

## Uso

1. Añade los nombres de los participantes
2. Registra cada gasto (concepto, importe y quién pagó)
3. Revisa el resumen: quién debe pagar a quién
4. Descarga en PDF o imagen para compartir con el grupo

## Desarrollo

```bash
npm start
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador.

## Despliegue en Vercel

1. Sube el proyecto a un repositorio en GitHub, GitLab o Bitbucket.
2. Ve a [vercel.com](https://vercel.com) e inicia sesión.
3. Clic en **Add New** → **Project**.
4. Importa el repositorio de la calculadora.
5. Vercel detectará automáticamente que es un sitio estático (sin build).
6. Clic en **Deploy**.

O desde la terminal con [Vercel CLI](https://vercel.com/cli):

```bash
npm i -g vercel
vercel
```

## Diseño

- Inspirado en Apple Human Interface Guidelines
- Colores accesibles WCAG AAA
- Responsive y optimizado para móvil

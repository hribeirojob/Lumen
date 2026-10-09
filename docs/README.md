# Página de instalação

A página é um app Vite separado do runtime do Lumen e está publicada em [lumen.vercel.app](https://lumen.vercel.app/).

```sh
npm install
npm run dev
```

Para gerar a versão de produção:

```sh
npm run build
```

Para publicar uma nova versão na Vercel:

```sh
vercel --prod --scope felipeinv-os
```

O workflow do GitHub Actions permanece manual e não dispara em cada push.

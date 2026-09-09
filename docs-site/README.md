# docs-site — docs.elapse.finance

Mintlify site; the pages live in `site/`. Spec: [`docs/specs/docs-site-frd.md`](../docs/specs/docs-site-frd.md).

```sh
pnpm install
pnpm dev             # mintlify on :3333
pnpm sync-snippets   # copies code snippets from examples/saas and the SDK, and openapi.json from api/, into site/
pnpm check           # snippets in sync, SDK surface matches the docs, mintlify validate, broken links
pnpm test            # vitest over the pages and snippets
```

Snippets are never hand-edited in `site/snippets/`; change the source and rerun the sync. Hosting builds from the `codypharm/elapse` fork on every push to `master`.

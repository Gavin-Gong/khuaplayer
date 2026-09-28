import { copyFile } from "node:fs/promises";

// Legal/privacy links must not depend on the source repository being public.
await Promise.all([
  copyFile(new URL("../../PRIVACY.md", import.meta.url), new URL("../dist/client/privacy.txt", import.meta.url)),
  copyFile(new URL("../../LICENSE", import.meta.url), new URL("../dist/client/license.txt", import.meta.url)),
]);

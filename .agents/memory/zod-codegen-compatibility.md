---
name: Zod codegen compatibility
description: Orval-generated Zod schemas require the workspace Zod major version to match the generator output.
---

The generated validator package must use the same Zod major version expected by the current Orval output.

**Why:** The generator emits modern top-level helpers such as `zod.int()` and `zod.url()` that do not exist in the workspace's older Zod major.

**How to apply:** When expanding the OpenAPI contract, run codegen and the library typecheck together; if generated helpers are missing, update the workspace catalog before changing generated files.
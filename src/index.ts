import { serve } from "@hono/node-server";
import { makeApp } from "./app.js";
import { loadStoreFromFile } from "./store.js";

const port = Number(process.env.PORT ?? 3021);
const storeFile = process.env.AI_BOOK_BACK_STORE_FILE;
const store = loadStoreFromFile(storeFile);
const app = makeApp(store, { storeFile, persist: Boolean(storeFile) });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`aibooksback listening on http://localhost:${info.port}`);
});


// Reads the published bundle from R2. Manifest, graph and indexes are cached
// per isolate and per version; docs and mail are fetched on demand.
import type { Doc, Graph, Index, Mail, Manifest } from "./types.ts";

export interface Content {
  version: string;
  manifest: Manifest;
  graph: Graph;
  indexes: Record<string, Index>;
}

const cache = new Map<string, Promise<Content>>();

async function getJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
  const obj = await bucket.get(key);
  return obj ? ((await obj.json()) as T) : null;
}

async function mustGetJson<T>(bucket: R2Bucket, key: string): Promise<T> {
  const v = await getJson<T>(bucket, key);
  if (v === null) throw new Error(`content bundle is missing ${key}`);
  return v;
}

export async function loadContent(bucket: R2Bucket): Promise<Content> {
  const current = await bucket.get("content/current");
  if (!current) throw new Error("content/current not found: compile and seed a bundle first");
  const version = (await current.text()).trim();
  let entry = cache.get(version);
  if (!entry) {
    entry = (async () => {
      const base = `content/${version}`;
      const [manifest, graph] = await Promise.all([
        mustGetJson<Manifest>(bucket, `${base}/manifest.json`),
        mustGetJson<Graph>(bucket, `${base}/graph.json`),
      ]);
      const indexes: Record<string, Index> = {};
      await Promise.all(
        manifest.engines.map(async (e) => {
          indexes[e.id] = await mustGetJson<Index>(bucket, `${base}/index/${e.id}.json`);
        }),
      );
      return { version, manifest, graph, indexes };
    })();
    entry.catch(() => cache.delete(version));
    cache.set(version, entry);
  }
  return entry;
}

const SAFE_ID = /^[a-z0-9-]+$/;

export function getDoc(bucket: R2Bucket, content: Content, id: string): Promise<Doc | null> {
  if (!SAFE_ID.test(id)) return Promise.resolve(null);
  return getJson<Doc>(bucket, `content/${content.version}/docs/${id}.json`);
}

export function getMail(bucket: R2Bucket, content: Content, id: string): Promise<Mail> {
  return mustGetJson<Mail>(bucket, `content/${content.version}/mail/${id}.json`);
}

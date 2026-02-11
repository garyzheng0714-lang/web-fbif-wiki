import { Client as MinioClient } from "minio";
import { env } from "@/server/env";

let client: MinioClient | null = null;

export function getObjectStorageClient(): MinioClient | null {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY || !env.S3_BUCKET) {
    return null;
  }
  if (client) return client;
  const u = new URL(env.S3_ENDPOINT);
  client = new MinioClient({
    endPoint: u.hostname,
    port: u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80,
    useSSL: u.protocol === "https:",
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    region: env.S3_REGION ?? "us-east-1",
    pathStyle: env.S3_FORCE_PATH_STYLE ?? true,
  });
  return client;
}

export async function ensureObjectBucket() {
  if (!env.S3_BUCKET) return;
  const c = getObjectStorageClient();
  if (!c) return;
  const exists = await c.bucketExists(env.S3_BUCKET);
  if (!exists) await c.makeBucket(env.S3_BUCKET, env.S3_REGION ?? "us-east-1");
}


import { z } from "zod";

const zBool = z
  .string()
  .transform((v) => v === "true")
  .or(z.boolean());

const schema = z.object({
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16).default("dev-secret-dev-secret-dev-secret"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(16)
    .default("dev-token-encryption-key-dev-token-encryption-key"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://postgres:postgres@localhost:5432/fbif_wiki?schema=public"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_FORCE_PATH_STYLE: zBool.optional(),

  FEISHU_BASE_URL: z.string().url().default("https://open.feishu.cn"),
  FEISHU_APP_ID: z.string().default(""),
  FEISHU_APP_SECRET: z.string().default(""),
  FEISHU_OAUTH_REDIRECT_URI: z.string().url().optional(),
  FEISHU_OAUTH_SCOPE: z.string().optional(),
  FEISHU_ALLOWED_TENANT_KEY: z.string().optional(),
  FEISHU_VERIFICATION_TOKEN: z.string().optional(),
  FEISHU_ENCRYPT_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);

import { env } from "@/server/env";

type FeishuEnvelope<T> = {
  code: number;
  msg: string;
  data?: T;
};

async function feishuJson<T>(
  path: string,
  init: RequestInit & { headers?: Record<string, string> },
): Promise<T> {
  const url = new URL(path, env.FEISHU_BASE_URL).toString();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: FeishuEnvelope<T>;
  try {
    json = JSON.parse(text) as FeishuEnvelope<T>;
  } catch {
    throw new Error(`Feishu API returned non-JSON: ${res.status} ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`Feishu HTTP ${res.status}: ${json.msg ?? text.slice(0, 200)}`);
  }
  if (typeof json.code !== "number" || json.code !== 0) {
    throw new Error(`Feishu API error code=${json.code} msg=${json.msg}`);
  }
  // Some Feishu APIs return payload at top-level (e.g. auth/v3 app_access_token),
  // while others nest under `data`.
  if (json.data !== undefined && json.data !== null) {
    return json.data;
  }
  const { code, msg, data, ...rest } = json as FeishuEnvelope<T> & Record<string, unknown>;
  void code;
  void msg;
  void data;
  return rest as T;
}

let appAccessTokenCache:
  | { token: string; expiresAtMs: number }
  | null = null;
let tenantAccessTokenCache:
  | { token: string; expiresAtMs: number }
  | null = null;

export async function getAppAccessToken(): Promise<string> {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    throw new Error("FEISHU_APP_ID / FEISHU_APP_SECRET is not configured");
  }
  const now = Date.now();
  if (appAccessTokenCache && appAccessTokenCache.expiresAtMs - 30_000 > now) {
    return appAccessTokenCache.token;
  }

  const data = await feishuJson<{ app_access_token: string; expire: number }>(
    "/open-apis/auth/v3/app_access_token/internal",
    {
      method: "POST",
      body: JSON.stringify({
        app_id: env.FEISHU_APP_ID,
        app_secret: env.FEISHU_APP_SECRET,
      }),
    },
  );

  appAccessTokenCache = {
    token: data.app_access_token,
    expiresAtMs: now + data.expire * 1000,
  };
  return data.app_access_token;
}

export async function getTenantAccessToken(): Promise<string> {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    throw new Error("FEISHU_APP_ID / FEISHU_APP_SECRET is not configured");
  }
  const now = Date.now();
  if (tenantAccessTokenCache && tenantAccessTokenCache.expiresAtMs - 30_000 > now) {
    return tenantAccessTokenCache.token;
  }

  const data = await feishuJson<{ tenant_access_token: string; expire: number }>(
    "/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      body: JSON.stringify({
        app_id: env.FEISHU_APP_ID,
        app_secret: env.FEISHU_APP_SECRET,
      }),
    },
  );

  tenantAccessTokenCache = {
    token: data.tenant_access_token,
    expiresAtMs: now + data.expire * 1000,
  };
  return data.tenant_access_token;
}

export type FeishuOAuthTokenData = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in?: number;
  open_id: string;
  user_id?: string;
  tenant_key: string;
};

export async function exchangeCodeForUserToken(code: string): Promise<FeishuOAuthTokenData> {
  const appAccessToken = await getAppAccessToken();
  return await feishuJson<FeishuOAuthTokenData>("/open-apis/authen/v1/access_token", {
    method: "POST",
    headers: { Authorization: `Bearer ${appAccessToken}` },
    body: JSON.stringify({ grant_type: "authorization_code", code }),
  });
}

export async function refreshUserAccessToken(
  refreshToken: string,
): Promise<Pick<FeishuOAuthTokenData, "access_token" | "expires_in" | "refresh_token" | "refresh_expires_in">> {
  const appAccessToken = await getAppAccessToken();
  return await feishuJson("/open-apis/authen/v1/refresh_access_token", {
    method: "POST",
    headers: { Authorization: `Bearer ${appAccessToken}` },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      // Some tenants require these fields; harmless if ignored.
      client_id: env.FEISHU_APP_ID,
      client_secret: env.FEISHU_APP_SECRET,
    }),
  });
}

export type FeishuUserInfo = {
  name: string;
  avatar_url?: string;
  open_id: string;
  user_id?: string;
  tenant_key?: string;
};

export async function getUserInfo(userAccessToken: string): Promise<FeishuUserInfo> {
  return await feishuJson<FeishuUserInfo>("/open-apis/authen/v1/user_info", {
    method: "GET",
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
}

export type WikiSpace = {
  space_id: string;
  name: string;
  description?: string;
  visibility?: string;
  space_type?: string;
};

export async function listAllWikiSpaces(userAccessToken: string): Promise<WikiSpace[]> {
  const out: WikiSpace[] = [];
  let pageToken: string | undefined = undefined;
  for (let i = 0; i < 200; i++) {
    const qs = new URLSearchParams();
    qs.set("page_size", "50");
    if (pageToken) qs.set("page_token", pageToken);
    const data = await feishuJson<{
      items: WikiSpace[];
      has_more?: boolean;
      page_token?: string;
    }>(`/open-apis/wiki/v2/spaces?${qs.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${userAccessToken}` },
    });
    out.push(...(data.items ?? []));
    if (!data.has_more) break;
    pageToken = data.page_token;
    if (!pageToken) break;
  }
  return out;
}

export type WikiNodeItem = {
  node_token: string;
  parent_node_token?: string;
  title: string;
  has_child?: boolean;
  obj_type: string;
  obj_token: string;
  obj_edit_time?: string;
};

export async function listWikiNodes(
  userAccessToken: string,
  spaceId: string,
  parentNodeToken?: string,
): Promise<WikiNodeItem[]> {
  const out: WikiNodeItem[] = [];
  let pageToken: string | undefined = undefined;
  for (let i = 0; i < 500; i++) {
    const qs = new URLSearchParams();
    qs.set("page_size", "50");
    if (pageToken) qs.set("page_token", pageToken);
    if (parentNodeToken) qs.set("parent_node_token", parentNodeToken);
    const data = await feishuJson<{
      items: WikiNodeItem[];
      has_more?: boolean;
      page_token?: string;
    }>(`/open-apis/wiki/v2/spaces/${spaceId}/nodes?${qs.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${userAccessToken}` },
    });
    out.push(...(data.items ?? []));
    if (!data.has_more) break;
    pageToken = data.page_token;
    if (!pageToken) break;
  }
  return out;
}

export type DocxBlockItem = {
  block_id: string;
  block_type: string;
  parent_id?: string;
  children?: string[];
  heading?: {
    elements?: DocxTextElement[];
  };
  todo?: {
    is_done?: boolean;
  };
  text?: {
    style?: Record<string, unknown>;
    elements?: DocxTextElement[];
  };
  code?: {
    language?: string;
    style?: Record<string, unknown>;
    elements?: DocxTextElement[];
  };
  [k: string]: unknown;
};

export type DocxTextElement = {
  text_run?: {
    content: string;
    text_element_style?: Record<string, unknown>;
  };
  mention_user?: { user_id: string };
  equation?: { content: string };
  [k: string]: unknown;
};

export async function fetchAllDocxBlocks(
  userAccessToken: string,
  documentId: string,
): Promise<DocxBlockItem[]> {
  const out: DocxBlockItem[] = [];
  let pageToken: string | undefined = undefined;
  for (let i = 0; i < 2000; i++) {
    const qs = new URLSearchParams();
    qs.set("page_size", "500");
    if (pageToken) qs.set("page_token", pageToken);
    const data = await feishuJson<{
      items: DocxBlockItem[];
      has_more?: boolean;
      page_token?: string;
    }>(`/open-apis/docx/v1/documents/${documentId}/blocks?${qs.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${userAccessToken}` },
    });
    out.push(...(data.items ?? []));
    if (!data.has_more) break;
    pageToken = data.page_token;
    if (!pageToken) break;
  }
  return out;
}

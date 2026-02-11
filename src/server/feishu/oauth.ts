import { env } from "@/server/env";

export function getFeishuOAuthRedirectUri(): string {
  if (env.FEISHU_OAUTH_REDIRECT_URI && env.FEISHU_OAUTH_REDIRECT_URI.trim()) {
    return env.FEISHU_OAUTH_REDIRECT_URI.trim();
  }
  return new URL("/api/auth/feishu/callback", env.APP_BASE_URL).toString();
}

export function buildFeishuOAuthUrl(state: string): string {
  const url = new URL("/open-apis/authen/v1/index", env.FEISHU_BASE_URL);
  const redirect = getFeishuOAuthRedirectUri();
  url.searchParams.set("app_id", env.FEISHU_APP_ID);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("state", state);
  if (env.FEISHU_OAUTH_SCOPE && env.FEISHU_OAUTH_SCOPE.trim()) {
    url.searchParams.set("scope", env.FEISHU_OAUTH_SCOPE.trim());
  }
  return url.toString();
}

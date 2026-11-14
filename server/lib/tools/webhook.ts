/**
 * browser_automation_webhook — triggers external webhooks (n8n, Make, Zapier, etc.)
 * for tasks outside the platform: social media posts, SMS, automations.
 */
export interface WebhookInput {
  webhook_url: string;
  method?: "GET" | "POST" | "PUT";
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
  description?: string;        // human description of what this webhook does
}

export async function browserAutomationWebhook(input: WebhookInput, _userId: string): Promise<unknown> {
  // Security: only allow https URLs (no localhost/internal)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.webhook_url);
  } catch {
    return { success: false, error: "رابط webhook غير صالح" };
  }

  if (parsedUrl.protocol !== "https:") {
    return { success: false, error: "يجب أن يبدأ رابط webhook بـ https://" };
  }

  // Block internal/private IPs
  const hostname = parsedUrl.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("192.168.") || hostname.startsWith("10.")) {
    return { success: false, error: "لا يُسمح بالوصول إلى الشبكة الداخلية" };
  }

  const method = input.method ?? "POST";
  const startTime = Date.now();

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "DalilRa9mana-Agent/1.0",
        ...(input.headers ?? {}),
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    };

    if (method !== "GET" && input.payload) {
      fetchOptions.body = JSON.stringify(input.payload);
    }

    const response = await fetch(input.webhook_url, fetchOptions);
    const elapsed = Date.now() - startTime;

    let responseBody: unknown;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      responseBody = await response.json().catch(() => null);
    } else {
      responseBody = await response.text().then(t => t.slice(0, 500)).catch(() => null);
    }

    return {
      success: response.ok,
      status: response.status,
      elapsed_ms: elapsed,
      webhook_url: input.webhook_url,
      description: input.description,
      response: responseBody,
      message: response.ok
        ? `✅ تم تنفيذ الأتمتة بنجاح (${response.status}) في ${elapsed}ms`
        : `⚠️ رد غير ناجح من الخادم (${response.status})`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      message: `❌ فشل الاتصال بـ webhook: ${err.message}`,
    };
  }
}

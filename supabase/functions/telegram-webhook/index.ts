import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ───────────────────── config ─────────────────────
const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

// Bilingual welcome DM sent to new subscribers (and on /start in private chat).
const WELCOME_MESSAGE = [
  "سڵاو! 👋 بەخێربێیت بۆ CTP Gold",
  "",
  "ئێمە ناردن بۆت:",
  "✅ سیگناڵی زێڕ، نەوت، BTC",
  "✅ هەواڵی بازاڕ بە کوردی",
  "✅ ئاگاداری پێش هەواڵی گرنگ",
  "✅ ڕاپۆرتی ڕۆژانە و هەفتانە",
  "",
  "Welcome to CTP Gold! 🥇",
  "Real-time signals for:",
  "Gold | Oil | Bitcoin",
  "",
  "t.me/goldmarketai",
].join("\n");

// ───────────────────── webhook auth ─────────────────────
async function deriveTelegramWebhookSecret(telegramApiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${telegramApiKey}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function safeEqual(a: string | null, b: string): boolean {
  if (!a) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ───────────────────── telegram helpers ─────────────────────
async function callTelegram(method: string, payload: Record<string, unknown>): Promise<boolean> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return false;
  try {
    const res = await fetch(`${TELEGRAM_GATEWAY}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) {
      // Most common case: user hasn't started the bot → "Forbidden". Not fatal.
      console.error(`telegram ${method} failed`, res.status, JSON.stringify(d));
      return false;
    }
    return true;
  } catch (e) {
    console.error(`telegram ${method} error`, String(e));
    return false;
  }
}

async function sendWelcome(userId: number | undefined): Promise<boolean> {
  if (!userId) return false;
  return await callTelegram("sendMessage", {
    chat_id: userId,
    text: WELCOME_MESSAGE,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!TELEGRAM_API_KEY) return new Response("Not configured", { status: 500 });

  const expectedSecret = await deriveTelegramWebhookSecret(TELEGRAM_API_KEY);
  const actualSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!safeEqual(actualSecret, expectedSecret)) return new Response("Unauthorized", { status: 401 });

  const update = await req.json().catch(() => ({}));

  try {
    // 1) Someone requested to join the channel (join-request mode) → approve + DM.
    if (update.chat_join_request) {
      const cjr = update.chat_join_request;
      await callTelegram("approveChatJoinRequest", {
        chat_id: cjr.chat?.id,
        user_id: cjr.from?.id,
      });
      await sendWelcome(cjr.from?.id);
    }

    // 2) A member's status in the channel changed → welcome new members/subscribers.
    const cm = update.chat_member;
    if (cm) {
      const oldStatus = cm.old_chat_member?.status;
      const newStatus = cm.new_chat_member?.status;
      const joined = (oldStatus === "left" || oldStatus === "kicked") &&
        (newStatus === "member" || newStatus === "administrator");
      if (joined && !cm.new_chat_member?.user?.is_bot) {
        await sendWelcome(cm.new_chat_member?.user?.id);
      }
    }

    // 3) /start in a private chat with the bot → send the welcome message.
    const msg = update.message ?? update.edited_message;
    if (msg?.chat?.type === "private" && typeof msg.text === "string" && msg.text.trim().startsWith("/start")) {
      await sendWelcome(msg.from?.id);
    }

    // Best-effort persistence (ignore if table is absent).
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey && typeof update.update_id === "number") {
        const supabase = createClient(supabaseUrl, serviceKey);
        await supabase.from("telegram_logs").insert({
          kind: "webhook_update",
          chat_id: String(msg?.chat?.id ?? cm?.chat?.id ?? update.chat_join_request?.chat?.id ?? ""),
          payload: update,
          status: "received",
          attempts: 0,
        });
      }
    } catch (_) { /* logging is best-effort */ }
  } catch (e) {
    console.error("telegram-webhook error", String(e));
  }

  // Always 200 so Telegram does not retry indefinitely.
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

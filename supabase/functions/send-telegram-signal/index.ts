import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
// Default destination: admin chat (@AndamAziz)
const DEFAULT_CHAT_ID = '144068979';
interface SignalPayload {
  symbol?: string;
  recommendation?: 'buy' | 'sell' | 'hold';
  confidence?: number;
  price?: number;
  entry?: string;
  targets?: string[];
  stopLoss?: string;
  horizonDays?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  headline?: string;
  timeframe?: string;
}
const recEmoji = (r?: string) => (r === 'buy' ? '🟢' : r === 'sell' ? '🔴' : '🟡');
const recText = (r?: string) =>
  r === 'buy' ? 'BUY / کڕین' : r === 'sell' ? 'SELL / فرۆشتن' : 'HOLD / هەڵگرتن';
const riskText = (r?: string) =>
  r === 'low' ? 'Low / نزم' : r === 'high' ? 'High / بەرز' : 'Medium / مامناوەند';
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function buildMessage(s: SignalPayload): string {
  const lines: string[] = [];
  lines.push(`${recEmoji(s.recommendation)} <b>${recText(s.recommendation)}</b>`);
  lines.push('');
  if (s.symbol) lines.push(`📊 <b>${esc(s.symbol)}</b>${s.timeframe ? ` · ${esc(s.timeframe)}` : ''}`);
  if (s.price != null) lines.push(`💵 Price / نرخ: <code>${esc(String(s.price))}</code>`);
  if (s.confidence != null) lines.push(`🎯 Confidence / متمانە: <b>${s.confidence}%</b>`);
  lines.push('');
  if (s.entry) lines.push(`🟦 Entry / داخڵبوون: <code>${esc(s.entry)}</code>`);
  if (s.targets && s.targets.length) {
    lines.push(`🎯 Targets / ئامانجەکان:`);
    s.targets.forEach((t, i) => lines.push(`   TP${i + 1}: <code>${esc(t)}</code>`));
  }
  if (s.stopLoss) lines.push(`🛑 Stop Loss / وەستان: <code>${esc(s.stopLoss)}</code>`);
  if (s.horizonDays != null) lines.push(`⏳  Horizon / ماوە: ${s.horizonDays} days / ڕۆژ`);
  if (s.riskLevel) lines.push(`⚠️ Risk / مەترسی: ${riskText(s.riskLevel)}`);
  if (s.headline) {
    lines.push('');
    lines.push(`📝 ${esc(s.headline)}`);
  }
  lines.push('');
  lines.push(`<i>Not financial advice / ئەمە ڕاوێژی دارایی نییە</i>`);
  return lines.join('\n');
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!TELEGRAM_BOT_TOKEN) {
      const msg = 'Missing Telegram credential: TELEGRAM_BOT_TOKEN';
      console.error(`[send-telegram-signal] ${msg}`);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // Authenticate the caller
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Only admins may broadcast signals
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Only admins can send signals' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = (await req.json()) as SignalPayload & { chatId?: string };
    if (!body?.recommendation) {
      return new Response(JSON.stringify({ error: 'Missing signal data' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const chatId = body.chatId || DEFAULT_CHAT_ID;
    const text = buildMessage(body);
    const tgResp = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const tgData = await tgResp.json();
    const ok = tgResp.ok && tgData.ok;
    // Human-readable hint explaining WHY the send failed (helps debug [403] {}).
    let hint = '';
    if (!ok) {
      if (tgResp.status === 403) {
        hint = chatId.startsWith('@')
          ? ' — bot is not an admin of this channel'
          : ' — user has not started the bot / blocked it';
      } else if (tgResp.status === 400) {
        hint = ' — bad request (chat_id invalid or message malformed)';
      } else if (tgResp.status === 401) {
        hint = ' — bot token rejected (check TELEGRAM_BOT_TOKEN)';
      }
      console.error(`[send-telegram-signal] failed [${tgResp.status}] chat=${chatId}${hint}`, JSON.stringify(tgData));
    }
    const errMsg = `Telegram error [${tgResp.status}] chat=${chatId}${hint}: ${JSON.stringify(tgData)}`;
    // Log the signal regardless of outcome
    const logRow = {
      symbol: body.symbol ?? null,
      recommendation: body.recommendation ?? null,
      confidence: body.confidence ?? null,
      price: body.price ?? null,
      entry: body.entry ?? null,
      targets: body.targets ?? [],
      stop_loss: body.stopLoss ?? null,
      horizon_days: body.horizonDays ?? null,
      risk_level: body.riskLevel ?? null,
      headline: body.headline ?? null,
      timeframe: body.timeframe ?? null,
      chat_id: chatId,
      telegram_message_id: ok ? (tgData.result?.message_id ?? null) : null,
      status: ok ? 'sent' : 'failed',
      error: ok ? null : errMsg,
      sent_by: userData.user.id,
    };
    await supabase.from('telegram_signals').insert(logRow);
    if (!ok) {
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ ok: true, messageId: tgData.result?.message_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

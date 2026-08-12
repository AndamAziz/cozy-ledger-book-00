import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const EMAIL_DOMAIN = 'notify.andam.uk'
// Any Lovable nameserver counts as delegated (the assigned pair varies:
// ns1/ns2, ns3/ns4, ns5/ns6, ...).
const LOVABLE_NS_SUFFIX = 'lovable.cloud'

interface DohAnswer {
  name: string
  type: number
  data: string
}

interface DohResponse {
  Status: number
  Answer?: DohAnswer[]
}

async function resolve(name: string, type: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { accept: 'application/dns-json' } },
    )
    if (!res.ok) {
      await res.text()
      return []
    }
    const json = (await res.json()) as DohResponse
    if (json.Status !== 0 || !json.Answer) return []
    return json.Answer.map((a) =>
      a.data.replace(/\.$/, '').replace(/^"|"$/g, '').toLowerCase().trim(),
    )
  } catch (_err) {
    return []
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const [ns, mx, txt] = await Promise.all([
      resolve(EMAIL_DOMAIN, 'NS'),
      resolve(EMAIL_DOMAIN, 'MX'),
      resolve(EMAIL_DOMAIN, 'TXT'),
    ])

    // MX answers look like "10 mxa.mailgun.org" -> keep the host part for display
    const mxHosts = mx.map((m) => m.split(/\s+/).pop() ?? m)

    const nsDelegated = ns.some((found) => found.endsWith(LOVABLE_NS_SUFFIX))
    const mxPresent = mxHosts.length > 0
    const spfPresent = txt.some((t) => t.includes('v=spf1'))

    // The domain is only considered "active" once delegation is live AND
    // Lovable has provisioned the mail records inside the delegated zone.
    const active = (nsDelegated && mxPresent) || (mxPresent && spfPresent)

    const body = {
      domain: EMAIL_DOMAIN,
      nsDelegated,
      mxPresent,
      spfPresent,
      active,
      records: { ns, mx: mxHosts, txt },
      checkedAt: new Date().toISOString(),
    }

    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: 'dns_check_failed', active: false }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})

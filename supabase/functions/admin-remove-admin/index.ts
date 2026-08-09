import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Only the CEO/super-admin can remove admins
    const CEO_EMAIL = 'andam@outlook.com'
    if ((user.email || '').toLowerCase() !== CEO_EMAIL) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only the CEO can remove admins' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { userId, targetEmail } = await req.json()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prevent removing own admin role
    if (userId === user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot remove your own admin role' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update user role to 'user' instead of 'admin'
    const { error: updateError } = await supabase
      .from('user_roles')
      .update({ role: 'user' })
      .eq('user_id', userId)

    if (updateError) {
      console.error('Error removing admin role:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to remove admin role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log the activity
    await supabase.from("admin_activity_logs").insert({
      admin_id: user.id,
      admin_email: user.email || "",
      action_type: "remove_admin",
      target_user_id: userId,
      target_user_email: targetEmail || null,
      details: { action: "Admin role removed from user" }
    });

    console.log(`Admin role removed from user ${userId} by ${user.id}`)

    return new Response(
      JSON.stringify({ success: true, message: 'Admin role removed successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in admin-remove-admin function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

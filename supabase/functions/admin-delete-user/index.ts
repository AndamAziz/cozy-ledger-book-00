import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to verify they're admin
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminUserId = claimsData.claims.sub;
    const adminEmail = claimsData.claims.email as string || '';

    // Check if requesting user is admin
    const { data: isAdmin } = await supabaseUser.rpc('has_role', {
      _user_id: adminUserId,
      _role: 'admin'
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only the CEO may delete a user account.
    const CEO_EMAIL = 'andam@outlook.com';
    if (adminEmail.toLowerCase() !== CEO_EMAIL) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only the CEO can delete user accounts' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId, targetEmail } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Deleting user:', userId);

    // Create admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Only the CEO may delete a user who is an admin.
    const CEO_EMAIL = 'andam@outlook.com';
    const { data: targetRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (targetRole && adminEmail.toLowerCase() !== CEO_EMAIL) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Only the CEO can delete an admin account' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the activity BEFORE deletion (so we have target info)
    await supabaseAdmin.from("admin_activity_logs").insert({
      admin_id: adminUserId,
      admin_email: adminEmail,
      action_type: "account_deleted",
      target_user_id: userId,
      target_user_email: targetEmail || null,
      details: { action: "Account and all data permanently deleted" }
    });

    // Delete user data from all tables
    const tables = ['incomes', 'expenses', 'sales', 'cigarettes'];
    
    for (const table of tables) {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq('user_id', userId);
      
      if (error) {
        console.error(`Error deleting from ${table}:`, error);
      } else {
        console.log(`Deleted user data from ${table}`);
      }
    }

    // Delete from user_approvals
    const { error: approvalError } = await supabaseAdmin
      .from('user_approvals')
      .delete()
      .eq('user_id', userId);
    
    if (approvalError) {
      console.error('Error deleting user_approvals:', approvalError);
    }

    // Delete from user_roles
    const { error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);
    
    if (rolesError) {
      console.error('Error deleting user_roles:', rolesError);
    }

    // Delete from auth.users
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Error deleting auth user:', authError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user from auth' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User completely deleted:', userId);

    return new Response(
      JSON.stringify({ success: true, message: 'User and all data deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

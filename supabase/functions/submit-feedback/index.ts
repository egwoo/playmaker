import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type FeedbackPayload = {
  message?: string;
  currentRole?: string | null;
  playbookId?: string | null;
  playId?: string | null;
  buildId?: string | null;
  appUrl?: string | null;
  userAgent?: string | null;
};

const resendApiKey = Deno.env.get('RESEND_API_KEY');
const feedbackToEmail = Deno.env.get('FEEDBACK_TO_EMAIL');
const feedbackFromEmail = Deno.env.get('FEEDBACK_FROM_EMAIL') ?? 'Playmaker Feedback <onboarding@resend.dev>';

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  });

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const {
    data: { user },
    error: userError
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: FeedbackPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const message = payload.message?.trim() ?? '';
  if (!message) {
    return json({ error: 'Feedback is required' }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { error: insertError } = await admin.from('feedback_submissions').insert({
    auth_user_id: user.id,
    user_role: payload.currentRole ?? null,
    playbook_id: payload.playbookId ?? null,
    play_id: payload.playId ?? null,
    message,
    build_id: payload.buildId ?? null,
    app_url: payload.appUrl ?? req.headers.get('referer') ?? 'unknown',
    user_agent: payload.userAgent ?? req.headers.get('user-agent') ?? null
  });

  if (insertError) {
    console.error('Failed to store feedback', insertError);
    return json({ error: 'Failed to store feedback' }, { status: 500 });
  }

  if (!resendApiKey || !feedbackToEmail) {
    console.warn('Feedback email skipped because RESEND_API_KEY or FEEDBACK_TO_EMAIL is not set');
    return json({ ok: true, emailed: false });
  }

  const titleSource = message.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  const condensedTitle = titleSource.replace(/\s+/g, ' ').slice(0, 72).trim();
  const subject = condensedTitle ? `Playmaker feedback: ${condensedTitle}` : 'Playmaker feedback';
  const text = [
    message,
    '',
    '---',
    `User ID: ${user.id}`,
    `Role: ${payload.currentRole ?? 'none'}`,
    `Playbook ID: ${payload.playbookId ?? 'none'}`,
    `Play ID: ${payload.playId ?? 'none'}`,
    `Build ID: ${payload.buildId ?? 'unknown'}`,
    `Submitted from: ${payload.appUrl ?? req.headers.get('referer') ?? 'unknown'}`,
    `User agent: ${payload.userAgent ?? req.headers.get('user-agent') ?? 'unknown'}`
  ].join('\n');

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: feedbackFromEmail,
      to: [feedbackToEmail],
      subject,
      text
    })
  });

  if (!emailResponse.ok) {
    const errorBody = await emailResponse.text();
    console.error('Failed to send feedback email', errorBody);
    return json({ ok: true, emailed: false });
  }

  return json({ ok: true, emailed: true });
});

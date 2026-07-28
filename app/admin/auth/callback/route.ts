import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  parseEmailOtpType,
  resolveAuthCallbackDestination,
} from "@/lib/auth-email-callback";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = parseEmailOtpType(searchParams.get("type"));
  const requestedNext = searchParams.get("next");
  const next = resolveAuthCallbackDestination({ type, requestedNext });

  // Hosted Auth templates send token hashes to this server-side boundary.
  if (token_hash && type) {
    const response = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });
    if (!error) return response;
  }

  // Handle OAuth / email code flow
  if (code) {
    const response = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
  }

  return NextResponse.redirect(
    `${origin}/admin/login?error=invalid_auth_link`,
  );
}

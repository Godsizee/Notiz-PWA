import { NextResponse } from "next/server";
import PocketBase from "pocketbase";

// Die Allowlist stand frueher als Literal im Quelltext — also die privaten
// E-Mail-Adressen realer Personen in einem oeffentlichen Repository, ohne deren
// Einwilligung. Jetzt kommt sie aus der Umgebung und fehlt sie, ist die
// Registrierung schlicht zu (fail closed). Konten legt man dann im
// PocketBase-Admin an, so wie im README beschrieben.
const ALLOWED_EMAILS = (process.env.REGISTRATION_ALLOWED_EMAILS || "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

// Kein Fallback auf eine konkrete Instanz mehr, siehe next.config.mjs.
const PB_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL;

// Einfaches Rate Limit pro IP. Bewusst im Prozessspeicher: die App laeuft als
// einzelner standalone-Container, und ein Redis nur hierfuer waere unverhaeltnis-
// maessig. Beim Neustart ist der Zaehler weg und ueber mehrere Repliken hinweg
// zaehlt jede fuer sich — wer das braucht, ersetzt das hier durch einen
// gemeinsamen Store.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();

  // Abgelaufene Eintraege wegraeumen, damit die Map nicht unbegrenzt waechst.
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) attempts.delete(key);
  }

  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_ATTEMPTS;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  try {
    if (!PB_URL) {
      console.error("POCKETBASE_URL / NEXT_PUBLIC_POCKETBASE_URL ist nicht gesetzt.");
      return NextResponse.json(
        { error: "Server ist nicht konfiguriert." },
        { status: 500 }
      );
    }

    if (rateLimited(clientIp(request))) {
      return NextResponse.json(
        { error: "Zu viele Versuche. Bitte später erneut probieren." },
        { status: 429 }
      );
    }

    if (ALLOWED_EMAILS.length === 0) {
      return NextResponse.json(
        { error: "Die Registrierung ist deaktiviert." },
        { status: 403 }
      );
    }

    const { email, password, passwordConfirm } = await request.json();

    if (!email || !password || !passwordConfirm) {
      return NextResponse.json({ error: "Alle Felder sind erforderlich." }, { status: 400 });
    }

    const normalizedEmail = (email as string).trim().toLowerCase();

    if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
      return NextResponse.json(
        { error: "Diese E-Mail-Adresse ist nicht für die Registrierung zugelassen." },
        { status: 403 }
      );
    }

    if (password !== passwordConfirm) {
      return NextResponse.json({ error: "Passwörter stimmen nicht überein." }, { status: 400 });
    }

    if ((password as string).length < 8) {
      return NextResponse.json(
        { error: "Das Passwort muss mindestens 8 Zeichen lang sein." },
        { status: 400 }
      );
    }

    const pb = new PocketBase(PB_URL);

    await pb.collection("users").create({
      email: normalizedEmail,
      password,
      passwordConfirm,
      // Bleibt bewusst true: die Presence-Avatare in ChecklistEditor.tsx lesen
      // expand.user.email, um zu zeigen, wer gerade mitschreibt. Auf false
      // gesetzt stuenden dort stumme Fragezeichen. Sauber loesen liesse sich
      // das mit einem eigenen, oeffentlichen Anzeigenamen-Feld auf users —
      // dann kann die Adresse privat werden.
      emailVisibility: true,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err: unknown) {
    const pbErr = err as {
      status?: number;
      message?: string;
      response?: unknown;
      data?: { data?: Record<string, { message: string }> };
    };
    console.error("Registration error:", pbErr?.response || err);

    if (pbErr.status === 400 && pbErr.data?.data?.email) {
      return NextResponse.json(
        { error: "Diese E-Mail-Adresse ist bereits registriert." },
        { status: 409 }
      );
    }

    // Frueher wurde pbErr.message an den Client durchgereicht — das konnte
    // interne Details der PocketBase-Instanz preisgeben. Details bleiben jetzt
    // im Serverlog.
    return NextResponse.json(
      { error: "Registrierung fehlgeschlagen. Bitte später erneut probieren." },
      { status: 500 }
    );
  }
}

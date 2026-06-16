import { NextResponse } from "next/server";
import PocketBase from "pocketbase";

const ALLOWED_EMAILS = [
  "badesebastian@outlook.com",
  "claudiaborg@web.de",
  "eztokk@gmail.com",
  "annaklatsche83@gmail.com",
];

const PB_URL =
  process.env.POCKETBASE_URL ||
  process.env.NEXT_PUBLIC_POCKETBASE_URL ||
  "https://pbnote.dasdann.jetzt";

export async function POST(request: Request) {
  try {
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

    const adminEmail = process.env.PB_SUPERUSER_EMAIL;
    const adminPassword = process.env.PB_SUPERUSER_PASSWORD;

    if (!adminEmail || !adminPassword) {
      return NextResponse.json(
        { error: "Serverkonfiguration unvollständig." },
        { status: 500 }
      );
    }

    const pb = new PocketBase(PB_URL);
    await pb.collection("_superusers").authWithPassword(adminEmail, adminPassword);

    await pb.collection("users").create({
      email: normalizedEmail,
      password,
      passwordConfirm,
      emailVisibility: true,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err: any) {
    console.error("Registration error:", err?.response || err);
    
    const pbErr = err as {
      status?: number;
      data?: { data?: Record<string, { message: string }> };
    };

    if (pbErr.status === 400 && pbErr.data?.data?.email) {
      return NextResponse.json(
        { error: "Diese E-Mail-Adresse ist bereits registriert." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: `Registrierung fehlgeschlagen: ${err?.message || "Unbekannter Fehler"}` },
      { status: 500 }
    );
  }
}

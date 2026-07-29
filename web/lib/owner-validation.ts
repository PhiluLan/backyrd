export type ContactValidation = {
  errors: Partial<Record<"email" | "phone" | "website", string>>;
  warnings: Partial<Record<"email" | "phone" | "website", string>>;
};

function empty(value: string) {
  return value.trim().length === 0;
}

export function validateOwnerContactClient(input: {
  email: string;
  phone: string;
  website: string;
  country?: string;
}): ContactValidation {
  const errors: ContactValidation["errors"] = {};
  const warnings: ContactValidation["warnings"] = {};

  const email = input.email.trim().toLowerCase();
  if (!empty(email) && !/^[^\s@]+@[^\s@]+\.[a-z]{2,63}$/i.test(email)) {
    errors.email = "Diese E-Mail-Adresse scheint unvollständig oder ungültig zu sein.";
  }

  let website = input.website.trim();
  if (!empty(website)) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const url = new URL(website);
      if (!url.hostname.includes(".") || url.hostname.split(".").pop()!.length < 2) {
        errors.website = "Bitte gib eine vollständige Website-Domain ein.";
      }
    } catch {
      errors.website = "Diese Website-Adresse scheint ungültig zu sein.";
    }
  }

  const rawPhone = input.phone.trim();
  if (!empty(rawPhone)) {
    let phone = rawPhone.replace(/[^\d+]/g, "");
    if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
    const isSwiss = ["schweiz", "switzerland", "ch", "suisse", "svizzera"].includes(
      (input.country ?? "Schweiz").trim().toLowerCase(),
    );
    if (isSwiss && phone.startsWith("0") && !phone.startsWith("00")) {
      phone = `+41${phone.slice(1)}`;
    }

    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      errors.phone = "Bitte gib die Telefonnummer inklusive Ländervorwahl vollständig ein.";
    } else if (phone.startsWith("+41") && phone.replace(/\D/g, "").length !== 11) {
      errors.phone = "Eine Schweizer Nummer benötigt nach +41 genau 9 Ziffern.";
    } else if (isSwiss && !phone.startsWith("+41")) {
      warnings.phone = "Die Nummer hat keine Schweizer Ländervorwahl. Bitte kurz prüfen.";
    }
  }

  return { errors, warnings };
}

export function firstContactValidationError(result: ContactValidation): string | null {
  return result.errors.email ?? result.errors.phone ?? result.errors.website ?? null;
}

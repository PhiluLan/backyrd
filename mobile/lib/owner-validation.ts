export type OwnerContactValidation = {
  errors: Partial<Record<"email" | "phone" | "website", string>>;
  warnings: Partial<Record<"email" | "phone" | "website", string>>;
};

export function validateOwnerContactMobile(input: {
  email: string;
  phone: string;
  website: string;
  country?: string | null;
}): OwnerContactValidation {
  const errors: OwnerContactValidation["errors"] = {};
  const warnings: OwnerContactValidation["warnings"] = {};

  const email = input.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,63}$/i.test(email)) {
    errors.email = "Diese E-Mail-Adresse scheint ungültig zu sein.";
  }

  let website = input.website.trim();
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    if (!/^https?:\/\/([a-z0-9-]+\.)+[a-z]{2,63}([/:?#].*)?$/i.test(website)) {
      errors.website = "Bitte gib eine vollständige Website-Adresse ein.";
    }
  }

  const raw = input.phone.trim();
  if (raw) {
    let phone = raw.replace(/[^\d+]/g, "");
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
      warnings.phone = "Die Nummer hat keine Schweizer Ländervorwahl.";
    }
  }

  return { errors, warnings };
}

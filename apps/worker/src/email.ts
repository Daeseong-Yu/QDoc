import nodemailer, { type Transporter } from "nodemailer";

type EmailProvider = "console" | "smtp";

let smtpTransporter: Transporter | null = null;

function getEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER;

  if (provider === "console" || provider === "smtp") {
    return provider;
  }

  throw new Error("EMAIL_PROVIDER must be set to console or smtp");
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function getSmtpPort() {
  const port = Number(process.env.SMTP_PORT ?? "587");

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port");
  }

  return port;
}

function getSmtpTransporter() {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: getRequiredEnv("SMTP_HOST"),
      port: getSmtpPort(),
      secure: process.env.SMTP_SECURE === "true",
      requireTLS: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      auth: {
        user: getRequiredEnv("SMTP_USER"),
        pass: getRequiredEnv("SMTP_PASS"),
      },
    });
  }

  return smtpTransporter;
}

function canUseConsoleDelivery() {
  return process.env.NODE_ENV !== "production";
}

function maskEmail(email: string) {
  const atIndex = email.lastIndexOf("@");

  if (atIndex <= 0) {
    return "masked";
  }

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (localPart.length <= 1) {
    return `*@${domain}`;
  }

  const visiblePrefix = localPart.length === 2 ? localPart.slice(0, 1) : localPart.slice(0, 2);
  const maskedPart = "*".repeat(localPart.length - visiblePrefix.length);

  return `${visiblePrefix}${maskedPart}@${domain}`;
}

export async function sendAlmostReadyEmail(input: {
  to: string;
  siteName: string;
  queueName: string;
  aheadCount: number;
}) {
  const provider = getEmailProvider();

  if (provider === "console") {
    if (!canUseConsoleDelivery()) {
      throw new Error("Console EMAIL_PROVIDER is not allowed in production");
    }

    console.log("Queue almost ready email", {
      to: maskEmail(input.to),
      siteName: input.siteName,
      queueName: input.queueName,
      aheadCount: input.aheadCount,
    });
    return;
  }

  if (provider !== "smtp") {
    throw new Error("Unsupported EMAIL_PROVIDER");
  }

  const aheadText = input.aheadCount === 0 ? "You are next." : `${input.aheadCount} patients are ahead of you.`;

  await getSmtpTransporter().sendMail({
    from: getRequiredEnv("EMAIL_FROM"),
    to: input.to,
    subject: "Your QDoc turn is coming up",
    text: `Your turn is coming up at ${input.siteName} (${input.queueName}). ${aheadText} Please stay nearby.`,
    html: `<p>Your turn is coming up at <strong>${input.siteName}</strong> (${input.queueName}).</p><p>${aheadText}</p><p>Please stay nearby.</p>`,
  });
}

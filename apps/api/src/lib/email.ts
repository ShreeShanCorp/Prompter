import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailClient {
  send(message: EmailMessage): Promise<void>;
}

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? "Prompter <onboarding@resend.dev>";

export class ResendEmailClient implements EmailClient {
  private readonly resend: Resend;

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<void> {
    await this.resend.emails.send({
      from: FROM_ADDRESS,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  }
}

/**
 * Section 7's documented fallback: "log email payload to console/log
 * instead of sending, clearly marked as not delivered" -- not a thrown
 * error or a disabled feature, since email delivery isn't user-blocking.
 */
export class LoggingEmailClient implements EmailClient {
  async send(message: EmailMessage): Promise<void> {
    console.warn(
      `[email not delivered -- RESEND_API_KEY not set] to=${message.to} subject="${message.subject}"`,
    );
  }
}

export function createDefaultEmailClient(): EmailClient {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return new LoggingEmailClient();
  return new ResendEmailClient(apiKey);
}

import { connect, type TLSSocket } from "node:tls";
import type {
  DeliveryEnvironment,
  DeliveryNotification,
} from "@/lib/notifications/providers/delivery";

/** ป้องกัน SMTP header injection ในค่าที่มาจาก config หรือฐานข้อมูล */
function assertSafeHeader(value: string) {
  if (/\r|\n/.test(value)) throw new Error("SMTP_HEADER_INVALID");
}

/** อ่าน SMTP response แบบหลายบรรทัดและเก็บ buffer ส่วนเกินไว้สำหรับคำสั่งถัดไป */
function createResponseReader(socket: TLSSocket) {
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
  });

  return async () => {
    while (true) {
      const lines = buffer.split("\r\n");
      for (let index = 0; index < lines.length - 1; index += 1) {
        if (/^\d{3} /.test(lines[index])) {
          const response = lines.slice(0, index + 1).join("\r\n");
          buffer = lines.slice(index + 1).join("\r\n");
          return response;
        }
      }
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          socket.off("data", onData);
          socket.off("error", onError);
          socket.off("timeout", onTimeout);
        };
        const onData = () => {
          cleanup();
          resolve();
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const onTimeout = () => {
          cleanup();
          reject(new Error("SMTP_TIMEOUT"));
        };
        socket.once("data", onData);
        socket.once("error", onError);
        socket.once("timeout", onTimeout);
      });
    }
  };
}

/** ส่งคำสั่ง SMTP และยอมรับเฉพาะ response code ที่กำหนด โดยไม่แนบข้อความ provider ใน error */
async function command(
  socket: TLSSocket,
  readResponse: () => Promise<string>,
  value: string | null,
  accepted: readonly number[],
) {
  if (value !== null) socket.write(`${value}\r\n`);
  const response = await readResponse();
  const code = Number(response.slice(0, 3));
  if (!accepted.includes(code)) throw new Error("SMTP_REJECTED");
}

/** ส่งอีเมลด้วย SMTP implicit TLS เท่านั้น เพื่อไม่ส่ง credential ผ่าน connection ที่ไม่เข้ารหัส */
export async function sendSmtpNotification(
  notification: DeliveryNotification,
  environment: DeliveryEnvironment,
) {
  const { emailFrom, smtpHost, smtpPort, smtpUsername, smtpPassword } = environment;
  if (
    !notification.recipient ||
    !emailFrom ||
    !smtpHost ||
    !smtpPort ||
    !environment.smtpSecure
  ) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }
  assertSafeHeader(notification.recipient);
  assertSafeHeader(emailFrom);
  assertSafeHeader(notification.title);

  const socket = connect({
    host: smtpHost,
    port: smtpPort,
    servername: smtpHost,
    rejectUnauthorized: true,
  });
  socket.setTimeout(10_000);
  const readResponse = createResponseReader(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
    socket.once("timeout", () => reject(new Error("SMTP_TIMEOUT")));
  });

  try {
    await command(socket, readResponse, null, [220]);
    await command(socket, readResponse, "EHLO fitness-pro.local", [250]);
    if (smtpUsername || smtpPassword) {
      if (!smtpUsername || !smtpPassword) throw new Error("SMTP_AUTH_INCOMPLETE");
      await command(socket, readResponse, "AUTH LOGIN", [334]);
      await command(
        socket,
        readResponse,
        Buffer.from(smtpUsername).toString("base64"),
        [334],
      );
      await command(
        socket,
        readResponse,
        Buffer.from(smtpPassword).toString("base64"),
        [235],
      );
    }
    await command(socket, readResponse, `MAIL FROM:<${emailFrom}>`, [250]);
    await command(
      socket,
      readResponse,
      `RCPT TO:<${notification.recipient}>`,
      [250, 251],
    );
    await command(socket, readResponse, "DATA", [354]);
    const subject = `=?UTF-8?B?${Buffer.from(notification.title).toString("base64")}?=`;
    const body = Buffer.from(notification.message).toString("base64");
    socket.write(
      `From: ${emailFrom}\r\nTo: ${notification.recipient}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}\r\n.\r\n`,
    );
    await command(socket, readResponse, null, [250]);
    await command(socket, readResponse, "QUIT", [221]);
  } finally {
    socket.destroy();
  }
}

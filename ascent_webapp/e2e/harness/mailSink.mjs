// An SMTP server that keeps every email the API sends, so tests can open invitation, reset and confirmation
// links. Listens on 127.0.0.1 only; nothing is delivered anywhere.
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

const KEEP = 1000;
const messages = []; // newest last

export function startMailSink(port) {
  const server = new SMTPServer({
    authOptional: true,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    logger: false,
    onAuth: (auth, session, done) => done(null, { user: auth.username }),
    onData: (stream, session, done) => {
      simpleParser(stream)
        .then((mail) => {
          messages.push({
            to: (session.envelope.rcptTo || []).map((r) => r.address.toLowerCase()),
            from: mail.from?.text || '',
            subject: mail.subject || '',
            html: typeof mail.html === 'string' ? mail.html : '',
            text: mail.text || '',
            date: new Date().toISOString(),
          });
          if (messages.length > KEEP) messages.splice(0, messages.length - KEEP);
          done();
        })
        .catch(done);
    },
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** Emails sent to `to` (every email when omitted), oldest first. */
export const mailTo = (to) => (to ? messages.filter((m) => m.to.includes(String(to).toLowerCase())) : [...messages]);

export function clearMail(to) {
  if (!to) { messages.length = 0; return; }
  const keep = messages.filter((m) => !m.to.includes(String(to).toLowerCase()));
  messages.splice(0, messages.length, ...keep);
}

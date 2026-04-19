import nodemailer from 'nodemailer';

export type EmailTemplate =
  | 'welcome'
  | 'trial_expiry_7d'
  | 'trial_expiry_3d'
  | 'trial_expiry_0d'
  | 'appointment_confirmation'
  | 'appointment_reminder';

function createTransporter() {
  const user = process.env['ZOHO_SMTP_USER'];
  const pass = process.env['ZOHO_SMTP_PASS'];
  if (!user || !pass) throw new Error('ZOHO_SMTP_USER / ZOHO_SMTP_PASS not configured');

  return nodemailer.createTransport({
    host: 'smtp.zoho.in',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

function buildEmail(template: EmailTemplate, data: Record<string, string>) {
  const from = `mydentalplatform <${process.env['ZOHO_SMTP_USER'] ?? 'mydentalplatform@zohomail.in'}>`;
  const support = 'mydentalplatform@zohomail.in';

  switch (template) {
    case 'welcome':
      return {
        from,
        subject: `Your dental website is live - ${data['clinicName']}`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:linear-gradient(135deg,#2563eb,#1e3a8a);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800">Your website is live!</h1>
    <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px">${data['clinicName']}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:15px;margin:0 0 20px">Hi ${data['doctorName'] || 'Doctor'},</p>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px">
      Congratulations! <strong>${data['clinicName']}</strong> is now live on mydentalplatform.
      Your patients can book appointments online 24/7.
    </p>
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px;margin:0 0 24px">
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.05em">Your details</p>
      <table style="width:100%;font-size:13px;color:#374151;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#6b7280;width:120px">Website</td><td><a href="${data['siteUrl']}" style="color:#2563eb;font-weight:600">${data['siteUrl']}</a></td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Admin panel</td><td><a href="${data['adminUrl']}" style="color:#2563eb;font-weight:600">${data['adminUrl']}</a></td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Login email</td><td style="font-weight:600">${data['email']}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Plan</td><td style="font-weight:600;text-transform:capitalize">${data['plan']}${data['trialEndDate'] ? ' - ends ' + data['trialEndDate'] : ''}</td></tr>
      </table>
    </div>
    <p style="color:#374151;font-size:14px;font-weight:700;margin:0 0 12px">What to do next:</p>
    <ol style="color:#374151;font-size:14px;line-height:1.8;margin:0 0 24px;padding-left:20px">
      <li>Open your website and try booking a test appointment</li>
      <li>Log into your admin dashboard to manage bookings</li>
      <li>Share your website link on WhatsApp with existing patients</li>
    </ol>
    <a href="${data['adminUrl']}" style="display:block;background:#2563eb;color:#fff;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">Go to admin dashboard -&gt;</a>
  </div>
  <div style="background:#f8fafc;padding:20px;text-align:center;font-size:12px;color:#9ca3af">
    Questions? Reply to this email or WhatsApp us at ${data['supportPhone'] || '+91-XXXXXXXXXX'}.<br>
    <a href="mailto:${support}" style="color:#6b7280">${support}</a>
  </div>
</div></body></html>`,
      };

    case 'trial_expiry_7d':
      return {
        from,
        subject: `7 days left on your free trial - ${data['clinicName']}`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:linear-gradient(135deg,#f59e0b,#b45309);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">7 days left on your trial</h1>
    <p style="color:#fef3c7;margin:8px 0 0;font-size:14px">${data['clinicName']}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px">
      Hi ${data['doctorName'] || 'Doctor'}, your free 30-day trial for <strong>${data['clinicName']}</strong> ends on
      <strong>${data['trialEndDate']}</strong>. After that, your website will go offline until you upgrade.
    </p>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 24px">
      Upgrade today to keep your website live and keep receiving new patient bookings.
    </p>
    <a href="https://wa.me/${data['supportWhatsapp'] || '919999999999'}?text=${encodeURIComponent('Hi! I want to upgrade my clinic \"' + data['clinicName'] + '\" on mydentalplatform. Please send the payment link.')}"
       style="display:block;background:#2563eb;color:#fff;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:12px">
      Upgrade now - keep my website live -&gt;
    </a>
    <p style="font-size:12px;color:#9ca3af;text-align:center">Or reply to this email and we'll send you a payment link.</p>
  </div>
  <div style="background:#f8fafc;padding:20px;text-align:center;font-size:12px;color:#9ca3af">
    <a href="mailto:${support}" style="color:#6b7280">${support}</a>
  </div>
</div></body></html>`,
      };

    case 'trial_expiry_3d':
      return {
        from,
        subject: `Only 3 days left - upgrade ${data['clinicName']} now`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #fecaca">
  <div style="background:linear-gradient(135deg,#ef4444,#b91c1c);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">3 days left on your trial</h1>
    <p style="color:#fecaca;margin:8px 0 0;font-size:14px">${data['clinicName']} - expires ${data['trialEndDate']}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px">
      Hi ${data['doctorName'] || 'Doctor'}, your clinic website will go <strong>offline in 3 days</strong>
      unless you upgrade. Patients will no longer be able to book appointments.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin:0 0 20px">
      <p style="margin:0;font-size:13px;color:#b91c1c;font-weight:600">What happens if you don't upgrade:</p>
      <ul style="margin:8px 0 0;padding-left:16px;font-size:13px;color:#374151;line-height:1.8">
        <li>Your website goes offline immediately after ${data['trialEndDate']}</li>
        <li>Patients trying to book will see an error</li>
        <li>Your data is safe - it comes back the moment you upgrade</li>
      </ul>
    </div>
    <a href="https://wa.me/${data['supportWhatsapp'] || '919999999999'}?text=${encodeURIComponent('Hi! I want to upgrade my clinic \"' + data['clinicName'] + '\" on mydentalplatform. Please send the payment link.')}"
       style="display:block;background:#ef4444;color:#fff;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
      Upgrade now - keep my website live -&gt;
    </a>
  </div>
  <div style="background:#f8fafc;padding:20px;text-align:center;font-size:12px;color:#9ca3af">
    <a href="mailto:${support}" style="color:#6b7280">${support}</a>
  </div>
</div></body></html>`,
      };

    case 'trial_expiry_0d':
      return {
        from,
        subject: `Your trial for ${data['clinicName']} has ended`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:#111827;padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">Your trial has ended</h1>
    <p style="color:#9ca3af;margin:8px 0 0;font-size:14px">${data['clinicName']}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px">
      Hi ${data['doctorName'] || 'Doctor'}, your free trial for <strong>${data['clinicName']}</strong> has ended and
      your website is currently offline. <strong>Your data is 100% safe</strong> - it'll be back the moment you upgrade.
    </p>
    <a href="https://wa.me/${data['supportWhatsapp'] || '919999999999'}?text=${encodeURIComponent('Hi! My clinic \"' + data['clinicName'] + '\" trial has ended on mydentalplatform. I want to reactivate it. Please send the payment link.')}"
       style="display:block;background:#2563eb;color:#fff;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:12px">
      Reactivate ${data['clinicName']} now -&gt;
    </a>
    <p style="font-size:12px;color:#9ca3af;text-align:center">
      Need help or have questions? We're here.<br>
      Email: <a href="mailto:${support}" style="color:#2563eb">${support}</a>
    </p>
  </div>
</div></body></html>`,
      };

    case 'appointment_confirmation':
      return {
        from,
        subject: `Appointment confirmed - ${data['clinicName']}`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:linear-gradient(135deg,#10b981,#047857);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">Appointment Confirmed</h1>
    <p style="color:#a7f3d0;margin:8px 0 0;font-size:14px">${data['clinicName']}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:14px;margin:0 0 20px">Hi ${data['patientName']},</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:0 0 24px">
      <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#6b7280;width:120px">Booking ref</td><td style="font-weight:700;color:#059669">${data['bookingRef']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Service</td><td style="font-weight:600">${data['service']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Date</td><td style="font-weight:600">${data['date']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Time</td><td style="font-weight:600">${data['time']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Clinic</td><td>${data['clinicName']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Address</td><td>${data['address']}</td></tr>
      </table>
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center">
      Save your booking ref <strong>${data['bookingRef']}</strong> to reschedule or cancel.<br>
      Call ${data['phone']} if you need to make changes within 24 hours.
    </p>
  </div>
</div></body></html>`,
      };

    case 'appointment_reminder':
      return {
        from,
        subject: `Reminder: your appointment tomorrow - ${data['clinicName']}`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:linear-gradient(135deg,#6366f1,#4338ca);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">Appointment Tomorrow</h1>
    <p style="color:#c7d2fe;margin:8px 0 0;font-size:14px">${data['clinicName']}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:14px;margin:0 0 16px">Hi ${data['patientName']},</p>
    <p style="color:#374151;font-size:14px;margin:0 0 20px">
      Just a reminder that you have an appointment at <strong>${data['clinicName']}</strong> tomorrow.
    </p>
    <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:20px;margin:0 0 20px">
      <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#6b7280;width:100px">Service</td><td style="font-weight:600">${data['service']}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Time</td><td style="font-weight:600">${data['time']}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Address</td><td>${data['address']}</td></tr>
      </table>
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center">
      Need to cancel? Call <a href="tel:${data['phone']}" style="color:#4338ca">${data['phone']}</a> at least 24 hours before.
    </p>
  </div>
</div></body></html>`,
      };

    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

export async function sendEmail(template: EmailTemplate, to: string, data: Record<string, string>): Promise<void> {
  if (!to?.includes('@')) return;

  try {
    const transporter = createTransporter();
    const { subject, html } = buildEmail(template, data);
    await transporter.sendMail({ from: `mydentalplatform <${process.env['ZOHO_SMTP_USER']}>`, to, subject, html });
    console.log(`[send-email] Sent ${template} to ${to}`);
  } catch (err) {
    console.error(`[send-email] Failed ${template} to ${to}:`, err);
  }
}
